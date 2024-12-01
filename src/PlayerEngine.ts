import { RecordingEvent, RecordingEventType } from "@contentsquare/recording-events";

type VNodeId = number;

export interface VAttr {
  name: string;
  value: string;
  namespaceURI: string;
}

interface Cursor {
  x?: number;
  y?: number;
  isPressed?: boolean;
  hover?: VNodeId;
}

interface VStyleSheet {
  id: number;
  cssRules: [];
}

// TODO: split this type in Specialized Type
export interface VNode {
  id: VNodeId;
  nodeType: string;
  localName?: string;
  namespaceURI?: string;
  data?: string;
  parentId?: VNodeId;
  shadowRoot?: VNode;
  contentDocument?: VNode;
  attributes?: VAttr[]; // TODO: do something to handle namespace
  children?: VNode[];
  adoptedStyleSheets?: VStyleSheet[];
  value?: string;
  checked?: boolean;
  selectedIndex?: number;
  scrollTop?: number;
  scrollLeft?: number;
  qualifiedName?: string;
  publicId?: string;
  systemId?: string;
}

interface Touch {
  id: number;
  x: number;
  y: number;
}

type SerializedNode = any;

function Play(eventType: RecordingEventType) {
  return (target: any, method: any) => {
    const Klass = target.constructor;
    const events = Klass.__events || {};
    events[eventType] = method;
    Klass.__events = events;
  };
}

interface Size {
  width: number;
  height: number;
}

export interface VirtualDOM {
  document: VNode | undefined;
  customElements: Set<string>;
  cursor: Cursor | undefined;
  touches: Touch[];
  viewport: Size | undefined;
  screen: Size | undefined;
}

export function createVirtualDOM(): VirtualDOM {
  return {
    document: undefined,
    customElements: new Set(),
    viewport: undefined,
    screen: undefined,
    cursor: undefined,
    touches: [],
  };
}

export class PlaybackEngine {
  private nodes: { [id: VNodeId]: VNode } = {};
  private state: VirtualDOM = createVirtualDOM();
  private dirtyNodes = new Set();

  constructor() {}

  private markDirty(id: VNodeId) {
    if (this.dirtyNodes.has(id)) return;
    const node = this.nodes[id] = { ...this.nodes[id] };
    this.dirtyNodes.add(id);
    if (node.parentId) {
      // make the parent dirty has well
      const parent = this.getNode(node.parentId);
      // update the children ref
      const siblings = parent.children!;
      const index = siblings.findIndex((child) => child.id === node.id);
      if (index !== -1) {
        siblings[index] = node;
        parent.children = [...siblings];
      } else if (parent.contentDocument?.id === node.id) {
        parent.contentDocument = node;
      } else if (parent.shadowRoot?.id === node.id) {
        parent.shadowRoot = node;
      }
    }
    else if (id === this.state.document?.id) {
      this.state.document = node;
    }
  }

  getVirtualDOM() {
    this.dirtyNodes.clear();
    return this.state;
  }

  getNode(id: VNodeId) {
    // when accessing to a node we make sure the nodes will be recreated
    this.markDirty(id);
    return this.nodes[id];
  }

  clear() {
    this.nodes = {};
    this.dirtyNodes.clear();
    this.state = createVirtualDOM();
    return this;
  }

  @Play(RecordingEventType.INITIAL_DOM)
  initialDOM(serializedNode: SerializedNode) {
    // TODO: not sure if I have to call the clear method here
    this.nodes = {};
    this.state.document = this.toVNode(serializedNode);
  }

  @Play(RecordingEventType.MUTATION_INSERT)
  mutationInsert(parentId: number, nextSibling: number, serializedNode: SerializedNode) {
    const node = this.toVNode(serializedNode);
    this.insertBefore(node, parentId, nextSibling);
  }

  @Play(RecordingEventType.MUTATION_MOVE)
  mutationMove(nodeId: number, nextSibling: number, parentId: number) {
    const node = this.getNode(nodeId);
    this.insertBefore(node, parentId, nextSibling);
  }

  @Play(RecordingEventType.MUTATION_REMOVE)
  mutationRemove(nodeId: number) {
    const node = this.getNode(nodeId);
    this.detachNode(node);
    for (const curr of this.visitNode(node))
      delete this.nodes[curr.id];
  }

  @Play(RecordingEventType.MUTATION_CHARACTER_DATA)
  mutationCharacterData(nodeId: number, data: string) {
    const node = this.getNode(nodeId);
    node.data = data;
  }

  @Play(RecordingEventType.MUTATION_ATTRIBUTE)
  mutationAttribute(nodeId: number, attrNamespace: string, attrName: string, attrValue: string) {
    // TODO: handle namespaceURI
    const node = this.getNode(nodeId);
    const attributes = node.attributes || [];
    const index = attributes.findIndex((attr) => !(attr.namespaceURI === attrNamespace && attr.name === attrName));
    if (attrValue === null || attrValue === undefined) {
      node.attributes = node.attributes?.filter((_attr, i) => i !== index);
    } else if (index === -1) {
      node.attributes = [...node.attributes || [], { namespaceURI: attrNamespace, name: attrName, value: attrValue }];
    } else {
      attributes[index] = { namespaceURI: attrNamespace, name: attrName, value: attrValue };
      node.attributes = [...attributes];
    }
  }

  @Play(RecordingEventType.ATTACH_SHADOW)
  attachShadow(nodeId: number, serializedShadow: SerializedNode) {
    const node = this.getNode(nodeId);
    node.shadowRoot = this.toVNode(serializedShadow, nodeId);
  }

  @Play(RecordingEventType.INPUT_TEXT)
  inputText(nodeId: number, text: string) {
    const node = this.getNode(nodeId);
    node.value = text;
  }

  @Play(RecordingEventType.INPUT_CHECKABLE)
  inputCheck(nodeId: number, checked: boolean) {
    const node = this.getNode(nodeId);
    node.checked = checked;
  }

  @Play(RecordingEventType.INPUT_SELECT)
  inputSelect(nodeId: number, selectedIndex: number) {
    const node = this.getNode(nodeId);
    node.selectedIndex = selectedIndex;
  }

  @Play(RecordingEventType.SCROLL)
  scroll(nodeId: number, left: number, top: number) {
    const node = this.getNode(nodeId);
    node.scrollTop = top;
    node.scrollLeft = left;
  }

  @Play(RecordingEventType.MOUSE_DOWN)
  mouseDown() {
    this.state.cursor = { ...this.state.cursor, isPressed: true };
  }

  @Play(RecordingEventType.MOUSE_UP)
  mouseUp() {
    this.state.cursor = { ...this.state.cursor, isPressed: false };
  }

  @Play(RecordingEventType.MOUSE_OVER)
  mouseOver(nodeId: number) {
    this.state.cursor = { ...this.state.cursor, hover: nodeId };
  }

  @Play(RecordingEventType.MOUSE_MOVE)
  mouseMove(x: number, y: number) {
    this.state.cursor = { ...this.state.cursor, x, y };
  }

  @Play(RecordingEventType.TOUCH_START)
  touchStart(fingerId: number, x: number, y: number) {
    this.state.touches = [...this.state.touches, { id: fingerId, x, y }];
  }

  @Play(RecordingEventType.TOUCH_MOVE)
  touchMove(fingerId: number, x: number, y: number) {
    const index = this.state.touches.findIndex((touch) => touch.id === fingerId);
    this.state.touches[index] = {
      ...this.state.touches[index],
      x,
      y,
    };
    this.state.touches = [...this.state.touches];
  }

  @Play(RecordingEventType.TOUCH_END)
  @Play(RecordingEventType.TOUCH_CANCEL)
  touchEnd(fingerId: number) {
    this.state.touches = this.state.touches.filter(touch => touch.id !== fingerId);
  }

  @Play(RecordingEventType.CUSTOM_ELEMENT_REGISTRATION)
  customElementRegistration(localName: string) {
    this.state.customElements = new Set([...this.state.customElements, localName]);
  }

  // TODO: handle all other events

  apply(events: RecordingEvent[]) {
    let isDirtyState = false;
    for (const event of events) {
      const method = getMethodName(event.type);
      if (method) {
        (this[method] as any)(...event.args);
        isDirtyState = true;
      }
    }
    if (isDirtyState) {
      this.state = { ...this.state };
    }
    return this;
  }

  private *visitNode(node: VNode): Generator<VNode> {
    yield node;
    for (const child of node.children || [])
      yield* this.visitNode(child);
    if (node.shadowRoot)
      yield* this.visitNode(node.shadowRoot);
    if (node.contentDocument)
      yield* this.visitNode(node.contentDocument);
  }

  private insertBefore(node: VNode, parentId: VNodeId, nextSibling?: VNodeId) {
    if (node.parentId)
      this.detachNode(node);
    node.parentId = parentId;
    const parent = this.getNode(parentId);
    const siblings = parent.children || [];
    const index = nextSibling ? siblings.findIndex(sibling => sibling.id === nextSibling) : -1;
    if (index > -1) {
      const prevSiblings = siblings!.slice(0, index);
      const nextSiblings = siblings!.slice(index);
      parent.children = [...prevSiblings, node, ...nextSiblings];
    } else {
      parent.children = [...siblings, node];
    }
  }

  private detachNode(node: VNode) {
    const parentId = node.parentId;
    if (parentId) {
      const parent = this.getNode(parentId);
      parent.children = parent.children?.filter(sibling => sibling.id !== node.id);
      node.parentId = undefined;
    }
  }

  private toVNode({ csId, children, shadowRoot, contentDocument, attributes, ...props }: SerializedNode, parentId?: VNodeId): VNode {
    const node: VNode = {
      id: csId,
      children: children?.map((child: SerializedNode) => this.toVNode(child, csId)),
      shadowRoot: shadowRoot && this.toVNode(shadowRoot, csId),
      contentDocument: contentDocument && this.toVNode(contentDocument, csId),
      attributes,
      parentId,
      ...props,
    };
    this.nodes[node.id] = node;
    return node;
  }
}

function getMethodName(eventType: RecordingEventType): keyof PlaybackEngine | undefined {
  return (PlaybackEngine as any).__events[eventType];
}