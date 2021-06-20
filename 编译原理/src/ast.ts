import { TokenReader } from "./token-reader";
import { createTokenizer, JSXTokenizer, Tokenizer } from "./tokenizer";
const fs = require("fs");
const path = require("path");

export module AST {
  export type ASTNodeType =
    | typeof ASTNodeType[keyof typeof ASTNodeType]
    | typeof FinalTokenType[keyof typeof FinalTokenType];

  export interface ASTNode {
    type: ASTNodeType;
    value?: string;
    children?: ASTNode[];
  }

  export interface ASTElementNode extends ASTNode {
    elementType?: "Text" | "Element";
    closeSelf?: Boolean | String;
  }

  // 非终结符
  export const ASTNodeType = {
    Program: Symbol("Program"),
    Expr: Symbol("Expr"),
    TagHead: Symbol("TagHead"),
    TagHeadStart: Symbol("TagHeadStart"),
    Attribute: Symbol("Attribute"),
    TagHeadEnd: Symbol("TagHeadEnd"),
    TagTail: Symbol("TagTail"),
  };

  // 终结符
  export const FinalTokenType = {
    Text: Symbol("Text"),
    LeftBracket: Symbol("LeftBracket"),
    Identifier: Symbol("Identifier"),
    AttributeKey: Symbol("AttributeKey"),
    Equator: Symbol("Equator"),
    AttributeValue: Symbol("AttributeValue"),
    BackFlash: Symbol("BackFlash"),
    RightBracket: Symbol("RightBracket"),
  };

  type UnFinalTokenHandlerReturnType = Boolean;
  type UnFinalTokenHandler = () => UnFinalTokenHandlerReturnType;

  type UnFinalToken =
    | "Program"
    | "Expr"
    | "TagHead"
    | "TagHeadStart"
    | "Attribute"
    | "TagHeadEnd"
    | "TagTail";

  interface IParse extends Record<UnFinalToken, UnFinalTokenHandler> {
    tokenReader: TokenReader;
    ast: ASTElementNode;
    closeSelf: Boolean;
  }

  export class Parse implements IParse {
    tokenReader: TokenReader = new TokenReader([]);
    ast: ASTElementNode;
    currentNode!: ASTElementNode;
    parentNode!: ASTElementNode;
    currentToken!: JSXTokenizer.IToken;
    closeSelf: Boolean = false;
    identifierStack: string[] = [];

    constructor(tokens: JSXTokenizer.IToken[]) {
      this.tokenReader.loadTokens(tokens);
      this.ast = this.toAST();
    }

    createASTNode(
      type: ASTNodeType,
      children: ASTElementNode[] | undefined,
      value?: string
    ): ASTElementNode {
      let node: ASTElementNode = {
        type: <any>type.toString(),
      };
      if (children !== undefined) node.children = children;
      if (value !== undefined) node.value = value;
      return node;
    }

    setCurrentToken(token: JSXTokenizer.IToken | null) {
      if (token !== null) {
        this.currentToken = token;
      }
    }

    toAST(): ASTNode {
      this.Program();
      return this.ast;
    }

    checkIdentifier() {
      if (this.closeSelf) return;

      let lastIdentifier = this.identifierStack.pop();
      if (this.tokenReader.peek()?.value !== lastIdentifier) {
        throw TypeError(
          `Unexpeted TagTail Identifier ${
            this.tokenReader.peek()?.value
          } whitch is not match ${lastIdentifier}`
        );
      }
    }

    Program(): UnFinalTokenHandlerReturnType {
      let root = this.createASTNode(ASTNodeType.Program, []);
      this.currentNode = root;
      this.parentNode = root;
      this.ast = root;
      debugger;
      if (this.Expr()) {
        console.log("AST Generate Success!");
        return true;
      }
      throw TypeError("AST Generate Failed!");
      return false;
    }

    Expr(): UnFinalTokenHandlerReturnType {
      this.setCurrentToken(this.tokenReader.peek());
      let oldParent = this.parentNode;
      let node = this.createASTNode(ASTNodeType.Expr, []);
      this.parentNode.children?.push(node);
      this.parentNode = node;

      if (this.currentToken.type === JSXTokenizer.Text) {
        let textNode = this.createASTNode(
          FinalTokenType.Text,
          undefined,
          this.currentToken.value
        );
        node.elementType = "Text";
        this.parentNode.children?.push(textNode);
        this.tokenReader.read();
        this.parentNode = oldParent;
        this.Expr();
        return true;
      } else if (this.TagHead()) {
        node.elementType = "Element";
        if (this.closeSelf) {
          this.parentNode = oldParent;
          this.Expr();
          return true;
        }
        this.parentNode = node;
        if (this.Expr()) {
          this.parentNode = node;
          if (this.TagTail()) {
            this.parentNode = oldParent;
            this.Expr();
            return true;
          }
          oldParent.children?.pop();
          return false;
        } else {
          this.parentNode = node;
          if (this.TagTail()) {
            this.parentNode = oldParent;
            this.Expr();
            return true;
          }
        }
      }
      oldParent.children?.pop();
      return false;
      throw TypeError(`Unexcepted Token: ${this.currentToken.value}`);
    }

    TagHead(): UnFinalTokenHandlerReturnType {
      this.closeSelf = false;
      this.setCurrentToken(this.tokenReader.peek());
      let node = this.createASTNode(ASTNodeType.TagHead, []);
      let oldParent = this.parentNode;
      this.parentNode.children?.push(node);
      this.parentNode = node;

      if (this.TagHeadStart()) {
        this.parentNode = node;
        if (this.Attribute()) {
          this.parentNode = node;
          if (this.TagHeadEnd()) {
            node.closeSelf = !!this.closeSelf;
            return true;
          }
          oldParent.children?.pop();
          return false;
        } else {
          this.parentNode = node;
          if (this.TagHeadEnd()) {
            node.closeSelf = !!this.closeSelf;
            return true;
          }
        }
      }
      oldParent.children?.pop();
      return false;
      throw TypeError(`Unexcepted Token: ${this.currentToken.value}`);
    }

    TagHeadStart(): UnFinalTokenHandlerReturnType {
      this.setCurrentToken(this.tokenReader.peek());
      let node = this.createASTNode(ASTNodeType.TagHeadStart, []);
      this.parentNode.children?.push(node);
      this.parentNode = node;

      if (this.currentToken.value === "<") {
        this.parentNode.children?.push(
          this.createASTNode(
            FinalTokenType.LeftBracket,
            undefined,
            this.currentToken.value
          )
        );
        this.tokenReader.read();
        this.setCurrentToken(this.tokenReader.peek());
        if (this.currentToken.type === JSXTokenizer.JSXIdentifierType) {
          this.identifierStack.push(this.currentToken.value);

          this.parentNode.children?.push(
            this.createASTNode(
              FinalTokenType.Identifier,
              undefined,
              this.currentToken.value
            )
          );
          this.tokenReader.read();
          return true;
        }
        this.tokenReader.unread();
        return false;
      }
      return false;
      throw TypeError(`Unexcepted Token: ${this.currentToken.value}`);
    }

    Attribute(): UnFinalTokenHandlerReturnType {
      this.setCurrentToken(this.tokenReader.peek());
      let oldParent = this.parentNode;
      let node = this.createASTNode(ASTNodeType.Attribute, []);
      this.parentNode.children?.push(node);
      this.parentNode = node;

      if (this.currentToken.type === JSXTokenizer.JSXAttributeKey) {
        this.parentNode.children?.push(
          this.createASTNode(
            FinalTokenType.AttributeKey,
            undefined,
            this.currentToken.value
          )
        );
        this.tokenReader.read();
        if (this.tokenReader.peek()?.type === JSXTokenizer.Equator) {
          this.parentNode.children?.push(
            this.createASTNode(
              FinalTokenType.Equator,
              undefined,
              this.tokenReader.peek()?.value
            )
          );
          this.tokenReader.read();
          if (
            this.tokenReader.peek()?.type === JSXTokenizer.JSXAttributeValue
          ) {
            this.parentNode.children?.push(
              this.createASTNode(
                FinalTokenType.AttributeValue,
                undefined,
                this.tokenReader.peek()?.value
              )
            );
            this.tokenReader.read();
            this.parentNode = oldParent;
            if (this.Attribute()) return true;
            return true;
          }
          this.tokenReader.unread(); // 把 = 退掉
          this.tokenReader.unread(); // 把 AttributeKey 退掉
          oldParent.children?.pop();
          return false;
        }
        this.parentNode = oldParent;
        this.Attribute();
        return true;
      }
      oldParent.children?.pop();
      return false;
      throw TypeError(`Unexcepted Token: ${this.currentToken.value}`);
    }

    TagHeadEnd(): UnFinalTokenHandlerReturnType {
      this.setCurrentToken(this.tokenReader.peek());
      let node = this.createASTNode(ASTNodeType.TagHeadEnd, []);
      this.parentNode.children?.push(node);
      this.parentNode = node;
      if (this.currentToken.type === JSXTokenizer.BackFlash) {
        this.parentNode.children?.push(
          this.createASTNode(
            FinalTokenType.BackFlash,
            undefined,
            this.currentToken.value
          )
        );
        this.tokenReader.read();
        if (this.tokenReader.peek()?.value === ">") {
          this.parentNode.children?.push(
            this.createASTNode(
              FinalTokenType.RightBracket,
              undefined,
              this.tokenReader.peek()?.value
            )
          );
          this.tokenReader.read();
          this.closeSelf = true;
          this.identifierStack.pop();
          return true;
        }
        this.tokenReader.unread();
        return false;
      }
      if (this.tokenReader.peek()?.value === ">") {
        this.parentNode.children?.push(
          this.createASTNode(
            FinalTokenType.RightBracket,
            undefined,
            this.tokenReader.peek()?.value
          )
        );
        this.tokenReader.read();
        return true;
      }
      return false;
      throw TypeError(`Unexcepted Token: ${this.currentToken.value}`);
    }

    TagTail(): UnFinalTokenHandlerReturnType {
      this.setCurrentToken(this.tokenReader.peek());
      let node = this.createASTNode(ASTNodeType.TagTail, []);
      this.parentNode.children?.push(node);
      this.parentNode = node;
      if (this.currentToken.value === "<") {
        this.parentNode.children?.push(
          this.createASTNode(
            FinalTokenType.LeftBracket,
            undefined,
            this.currentToken.value
          )
        );
        this.tokenReader.read();
        if (this.tokenReader.peek()?.type === JSXTokenizer.BackFlash) {
          this.parentNode.children?.push(
            this.createASTNode(
              FinalTokenType.BackFlash,
              undefined,
              this.tokenReader.peek()?.value
            )
          );
          this.tokenReader.read();
          if (
            this.tokenReader.peek()?.type === JSXTokenizer.JSXIdentifierType
          ) {
            this.checkIdentifier();
            this.parentNode.children?.push(
              this.createASTNode(
                FinalTokenType.Identifier,
                undefined,
                this.tokenReader.peek()?.value
              )
            );
            this.tokenReader.read();
            if (this.tokenReader.peek()?.value === ">") {
              this.parentNode.children?.push(
                this.createASTNode(
                  FinalTokenType.RightBracket,
                  undefined,
                  this.tokenReader.peek()?.value
                )
              );
              this.tokenReader.read();
              return true;
            }
            this.tokenReader.unread();
            this.tokenReader.unread();
            this.tokenReader.unread();
            return false;
          }
          this.tokenReader.unread();
          this.tokenReader.unread();
          return false;
        }
        this.tokenReader.unread();
        return false;
      }
      return false;
      throw TypeError(`Unexcepted Token: ${this.currentToken.value}`);
    }
  }
}

const vformXml = fs
  .readFileSync(path.resolve(__dirname, "./vform-item.dxml"))
  .toString();

let tokenizer = createTokenizer(Tokenizer);
tokenizer.run(vformXml);
console.log(tokenizer.tokens.length);

let parser = new AST.Parse(tokenizer.tokens);
console.log(JSON.stringify(parser.ast));

fs.writeFileSync(
  path.resolve(__dirname, "./vformItemAST.json"),
  JSON.stringify(parser.ast)
);
