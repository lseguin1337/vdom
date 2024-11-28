
import { Store, useStore } from '@tanstack/react-store';
import { createContext, createElement, createRef, FC, forwardRef, useContext, useEffect, useMemo } from 'react';
import { VirtualDOM } from './core-player';

type RC = FC<{ id: number }>;

type SerializedNode = {
  csId: number;
  children?: SerializedNode[];
  shadowRoot?: SerializedNode;
  attributes?: { name: string, value: string, namespaceURI?: string }[];
  [prop: string]: any;
}

type NodeState = {
  id: number;
  parentId?: number;
  children?: number[];
  shadowRoot?: number;
  [prop: string]: any;
}

interface NodesState {
  [nodeId: number]: NodeState;
}

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

interface RenderingState {
  nodes: NodesState,
}

const RenderingContext = createContext<Store<RenderingState>>(null as unknown as Store<RenderingState>);

const RenderComment: RC = ({ id }) => {
  const commentData = useCharacterData(id);
  const document = useDocument();
  const commentNode = useMemo(() => document.createComment(''), [document]);

  useEffect(() => {
    commentNode.data = commentData;
  }, [commentData]);

  return useNativeNode(commentNode);
};

const RenderElementIframe: RC = ({ id }) => {
  // TODO: RenderIframe
  return createElement('iframe', { key: id });
};

const RenderElementLink: RC = ({ id }) => {
  //...
  // TODO: RenderLink
  return createElement('link', { key: id });
};

const RenderElementScript: RC = ({ id }) => {
  // TODO: RenderLink
  return createElement('script', { key: id });
};

const RenderElementStyle: RC = ({ id }) => {
  // TODO: RenderLink
  return createElement('style', { key: id });
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

function useSelector<T>(selector: (state: NodesState) => T) {
  const store = useContext(RenderingContext);
  return useStore(store, (state) => selector(state.nodes));
}

function useNodeProp<Prop extends keyof NodeState>(id: number, prop: Prop): NodeState[Prop] {
  return useSelector((nodes) => nodes[id][prop]);
}

function useNodeAttributes(id: number) {
  return useNodeProp(id, 'attributes');
}

function useCharacterData(id: number) {
  return useNodeProp(id, 'data');
}

function useChildNodes(id: number) {
  return useNodeProp(id, 'children') as number[];
}

function useLocalName(id: number): string {
  return useNodeProp(id, 'localName');
}

function useNamespaceURI(id: number): string {
  return useNodeProp(id, 'namespaceURI');
}

function useNodeType(id: number) {
  return useNodeProp(id, 'nodeType');
}

function useDocument() {
  return document;
}

const RenderChildNodes: RC = ({ id }) => {
  const childNodeIds = useChildNodes(id);
  return (<>{childNodeIds.map(childId => (<RenderNode key={childId} id={childId} />))}</>);
}

const RenderDefaultElement: RC = ({ id }) => {
  const localName = useLocalName(id);
  const attributes = useNodeAttributes(id);
  // const shadowRootRef = useShadowNode(id);

  return createElement(
    localName,
    { key: id, ...attributes },
    <RenderChildNodes id={id} />,
  );
}

const RenderElement: RC = ({ id }) => {
  const localName = useLocalName(id);
  const namespaceURI = useNamespaceURI(id);

  if (namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    return (<RenderElementWithNamespaceURI id={id} />);
  }
  if (localName in elements) {
    const SpecializedElement = elements[localName as keyof typeof elements];
    return (<SpecializedElement id={id} />);
  }
  return (<RenderDefaultElement id={id} />);
};

const RenderDocument: RC = ({ id }) => {
  return <RenderChildNodes id={id} />;
};

const RenderDocType: RC = ({ id }) => {
  const document = useDocument();
  const { qualifiedName, publicId, systemId } = useSelector((nodes) => nodes[id]);
  const docType = useMemo(() => document.implementation.createDocumentType(qualifiedName, publicId, systemId), [document, qualifiedName, publicId, systemId]);
  return useNativeNode(docType);
};

const RenderText: RC = ({ id }) => {
  return useCharacterData(id);
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

const RenderNode: RC = ({ id }) => {
  const nodeType = useNodeType(id) as keyof typeof nodes;
  const SpecializedNode = nodes[nodeType];
  return (<SpecializedNode id={id} />);
};

export const RenderDOM: FC<{ nodes: any, rootId: number | null }> = ({ nodes, rootId }) => {
  const store = useMemo(() => new Store<RenderingState>({ nodes: {} }), []);

  useEffect(() => {
    store.setState(() => ({ nodes }));
  }, [store, nodes]);

  const rootNode = useStore(store, ({ nodes }) => rootId && nodes[rootId]);

  return (
    <RenderingContext.Provider value={store}>
      {rootNode && <RenderNode id={rootNode.id} />}
    </RenderingContext.Provider>
  );
};