
import { createElement, createRef, FC, useEffect, useMemo } from 'react';
import { VirtualDOM, VNode } from './PlayerEngine';

type RC = FC<{ node: VNode }>;

// hacking tool to be able to create a custom node type
function useNativeNode(node: Node & { [key: string]: any }) {
  const ref = createRef<HTMLElement>();

  useEffect(() => {
    if (ref.current === node) return;
    const placeholder = ref.current! as HTMLElement & { [key: string]: any };
    const reactKeys = Object.keys(placeholder as any).filter((key) => key.startsWith('__react'));
    const fiberKey = reactKeys.find(key => key.startsWith('__reactFiber$')) as string;
    const reactFiber = placeholder[fiberKey];
    
    // clone all react keys
    for (const reactKey of reactKeys)
      node[reactKey] = placeholder[reactKey];

    // replace node ref
    reactFiber.stateNode = node;
    reactFiber.ref.current = node;
    placeholder!.replaceWith(node);
  }, [node]);

  return createElement('cs-element-placeholder', { ref });
}

const RenderComment: RC = ({ node }) => {
  const document = useDocument();
  const commentNode = useMemo(() => document.createComment(''), [document]);

  useEffect(() => {
    commentNode.data = node.data || '';
  }, [node.data]);

  return useNativeNode(commentNode);
};

const RenderElementIframe: RC = ({ node }) => {
  // TODO: RenderIframe
  return createElement('iframe', { key: node.id });
};

const RenderElementLink: RC = ({ node }) => {
  //...
  // TODO: RenderLink
  return createElement('link', { key: node.id });
};

const RenderElementScript: RC = ({ node }) => {
  // TODO: RenderLink
  return createElement('script', { key: node.id });
};

const RenderElementStyle: RC = ({ node }) => {
  // TODO: RenderLink
  return createElement('style', { key: node.id });
};

const elements = {
  iframe: RenderElementIframe,
  link: RenderElementLink,
  style: RenderElementStyle,
  script: RenderElementScript,
};

const RenderElementWithNamespaceURI: RC = () => {
  return (<></>);
};

function useDocument() {
  return document;
}

const RenderChildNodes: RC = ({ node }) => {
  const children = node.children;
  return (<>{children?.map(child => (<RenderNode key={child.id} node={child} />))}</>);
}

const RenderDefaultElement: RC = ({ node }) => {
  const { localName, attributes, /* shadowRoot */ } = node as VNode & { localName: string };
  return createElement(
    localName,
    { key: node.id, ...attributes },
    <RenderChildNodes node={node} />,
  );
}

const RenderElement: RC = ({ node }) => {
  const { localName, namespaceURI } = node as VNode & { localName: string, namespaceURI: string };

  if (namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    return (<RenderElementWithNamespaceURI node={node} />);
  }
  if (localName in elements) {
    const SpecializedElement = elements[localName as keyof typeof elements];
    return (<SpecializedElement node={node} />);
  }
  return (<RenderDefaultElement node={node} />);
};

const RenderDocument: RC = ({ node }) => {
  return <RenderChildNodes node={node} />;
};

const RenderDocType: RC = ({ node }) => {
  const document = useDocument();
  const { qualifiedName, publicId, systemId } = node as VNode & { qualifiedName: string, publicId: string, systemId: string };
  const docType = useMemo(() => document.implementation.createDocumentType(qualifiedName, publicId, systemId), [document, qualifiedName, publicId, systemId]);
  return useNativeNode(docType);
};

const RenderText: RC = ({ node }) => {
  return node.data;
};

const RenderCDATASection: RC = () => {
  // TODO: find a way
  return <></>;
};

const nodes = {
  [Node.TEXT_NODE]: RenderText,
  [Node.ELEMENT_NODE]: RenderElement,
  [Node.COMMENT_NODE]: RenderComment,
  [Node.DOCUMENT_TYPE_NODE]: RenderDocType,
  [Node.DOCUMENT_NODE]: RenderDocument,
  [Node.CDATA_SECTION_NODE]: RenderCDATASection,
};

const RenderNode: RC = ({ node }) => {
  const SpecializedNode = nodes[node.nodeType as unknown as keyof typeof nodes];
  return (<SpecializedNode node={node} />);
};

export const RenderDOM: FC<{ vdom: VirtualDOM }> = ({ vdom }) => {
  if (!vdom.document) return <></>;
  return <RenderNode node={vdom.document} />
};