export class DirtyElementBuilder {
  private domParser = new DOMParser();

  createElement(tagName: string) {
    const sanitizedTagName = this.htmlSanitizer(tagName);
    return this.parseHtmlElement(`<${sanitizedTagName} />`);
  }

  createAttribute(attrName: string, attrValue: string) {
    const sanitizedAttrName = this.htmlSanitizer(attrName);
    const div = this.parseHtmlElement(`<div ${sanitizedAttrName}=""></div>`);
    const attr = div.getAttributeNode(sanitizedAttrName)!;
    div.removeAttributeNode(attr);
    attr.value = attrValue;
    return attr;
  }

  public createDoctype(
    name?: string,
    systemId?: string,
    publicId?: string,
  ): DocumentType {
    const nameStr = this.htmlSanitizer(name || "");
    const publicStr = this.htmlSanitizer(publicId || "");
    const systemStr = this.htmlSanitizer(systemId || "");
    return this.domParser.parseFromString(
      `<!DOCTYPE${nameStr ? ` ${nameStr}` : ""}${
        publicStr ? ` PUBLIC "${publicStr}"` : ""
      } ${
        systemStr
          ? publicStr
            ? ` "${systemStr}"`
            : ` SYSTEM "${systemStr}"`
          : ""
      }>`,
      "text/html",
    ).doctype as DocumentType;
  }

  private parseHtmlElement(unsafeHtml: string): HTMLElement {
    const document = this.domParser.parseFromString(unsafeHtml, "text/html");
    return document.body.children[0] as HTMLElement;
  }

  private htmlSanitizer(tagName: string) {
    return tagName.replace(/[\s<>\/\0]/g, "");
  }
}