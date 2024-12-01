
import { createElement, FC, useCallback, useEffect, useMemo, useState } from 'react';
import { VirtualDOM, VNode } from './PlayerEngine';
import { createRoot } from './react-render';

type RC = FC<{ node: VNode }>;

function useChildDocRenderer(node?: VNode) {
  const [root, setRoot] = useState<ReturnType<typeof createRoot> | null>(null);

  useEffect(() => {
    root?.render(node ? <RenderNode node={node} /> : null);
  }, [root, node]);

  const destroy = useCallback(() => root?.unmount(), [root]);
  useEffect(() => destroy, [destroy]);

  return useCallback((event: any) => {
    const iframe =  event.target as HTMLIFrameElement & { _root?: ReturnType<typeof createRoot> };
    iframe._root?.unmount();
    const doc = iframe.contentDocument;
    setRoot((iframe._root = createRoot(doc)));
  }, []);
}

const RenderComment: RC = ({ node }) => {
  return createElement('#comment', { data: node.data });
};

const RenderElementIframe: RC = ({ node }) => {
  const onLoad = useChildDocRenderer(node.contentDocument);
  return (createElement('iframe', { onLoad, namespaceURI: node.namespaceURI, attributes: node.attributes }));
};

const RenderElementLink: RC = ({ node }) => {
  return createElement('link', { key: node.id, namespaceURI: node.namespaceURI, attributes: node.attributes });
};

const RenderElementScript: RC = ({ node }) => {
  return createElement('script', { key: node.id, namespaceURI: node.namespaceURI });
};

const RenderElementStyle: RC = ({ node }) => {
  const children = useMemo(() => {
    // TODO: transform stylesheet here
    return node.children;
  }, [node.children]);

  return createElement('style', { key: node.id, namespaceURI: node.namespaceURI, attributes: node.attributes }, <RenderChildNodes nodes={children} />);
};

const elements = {
  iframe: RenderElementIframe,
  link: RenderElementLink,
  style: RenderElementStyle,
  script: RenderElementScript,
};

const RenderChildNodes: FC<{ nodes?: VNode[] }> = ({ nodes }) => {
  return (<>{nodes?.map(child => (<RenderNode key={child.id} node={child} />))}</>);
};

const RenderShadowRoot: RC = ({ node }) => {
  return createElement('#shadowRoot', {
    mode: 'open',
    adoptedStylesheets: node.adoptedStylesheets,
  }, <RenderChildNodes nodes={node.children} />);
};

const RenderDefaultElement: RC = ({ node }) => {
  const { localName, attributes, shadowRoot, namespaceURI } = node as VNode & { localName: string };
  return createElement(
    localName,
    {
      key: `${node.id}${namespaceURI}${shadowRoot ? '-with-shadow' : ''}`,
      namespaceURI,
      attributes,
    },
    <>
      {shadowRoot && <RenderShadowRoot node={shadowRoot} />}
      <RenderChildNodes nodes={node.children} />
    </>
  );
}

const RenderElement: RC = ({ node }) => {
  const { localName } = node as VNode & { localName: string, namespaceURI: string };
  if (localName in elements) {
    const SpecializedElement = elements[localName as keyof typeof elements];
    return (<SpecializedElement node={node} />);
  }
  return (<RenderDefaultElement node={node} />);
};

const RenderDocument: RC = ({ node }) => {
  return <RenderChildNodes nodes={node.children} />;
};

const RenderDocType: RC = ({ node }) => {
  const { qualifiedName, publicId, systemId } = node as VNode & { qualifiedName: string, publicId: string, systemId: string };
  return createElement('#doctype', { key: `${qualifiedName}/${publicId}/${systemId}`, qualifiedName, publicId, systemId });
};

const RenderText: RC = ({ node }) => {
  return node.data;
};

const RenderCDATASection: RC = () => {
  return createElement('#cdatasection');
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
  return <SpecializedNode node={node} />;
};

export const RenderDOM: FC<{ vdom: VirtualDOM }> = ({ vdom }) => {
  const onLoad = useChildDocRenderer(vdom.document);
  // TODO: render window size
  return <iframe style={{ border: 'none', width: '100%', height: '100%', ...vdom.viewport }} onLoad={onLoad} />;
};