import { RecordingEvent, RecordingEventType } from "@contentsquare/recording-events";

type VNodeId = string;

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
  attributes?: VAttr[];
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

function Type(eventType: RecordingEventType) {
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

export class CSDom {
  private nodes: { [key: string]: VNode } = {};
  private state: VirtualDOM = createVirtualDOM();
  private dirtyNodes = new Set<string>();

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
    else {
      const oldDoc = this.state.document;
      if (node.id === oldDoc?.id) {
        this.state.document = node;
      } else {
        console.warn('Something weird it should be always true');
      }
    }
  }

  getVirtualDOM() {
    this.dirtyNodes.clear();
    return this.state;
  }

  toVNodeId(id: number, context: string | undefined): VNodeId {
    return context ? `${context}/${id}` : `${id}`;
  }

  getNode(id: VNodeId) {
    this.markDirty(id);
    return this.nodes[id];
  }

  clear() {
    this.nodes = {};
    this.dirtyNodes.clear();
    this.state = createVirtualDOM();
    return this;
  }

  @Type(RecordingEventType.INITIAL_DOM)
  initialDOM(event: RecordingEvent) {
    const [serializedNode] = event.args as [SerializedNode];
    const document = this.toVNode(serializedNode, event.context, event.context);
    if (event.context) {
      const parentNode = this.getNode(event.context);
      parentNode.contentDocument = document;
    } else {
      this.state.document = document;
    }
  }

  @Type(RecordingEventType.MUTATION_INSERT)
  mutationInsert({ args, context }: RecordingEvent) {
    const [parentId, nextSibling, serializedNode] = args as [number, number, SerializedNode];
    const node = this.toVNode(serializedNode, context);
    this.insertBefore(node, this.toVNodeId(parentId, context), this.toVNodeId(nextSibling, context));
  }

  @Type(RecordingEventType.MUTATION_MOVE)
  mutationMove({ args, context }: RecordingEvent) {
    const [nodeId, nextSibling, parentId] = args as [number, number, number];
    const node = this.getNode(this.toVNodeId(nodeId, context));
    this.insertBefore(node, this.toVNodeId(parentId, context), this.toVNodeId(nextSibling, context));
  }

  @Type(RecordingEventType.MUTATION_REMOVE)
  mutationRemove({ args, context }: RecordingEvent) {
    const [nodeId] = args as [number];
    const node = this.getNode(this.toVNodeId(nodeId, context));
    this.detachNode(node);
    for (const curr of this.visitNode(node))
      delete this.nodes[curr.id];
  }

  @Type(RecordingEventType.MUTATION_CHARACTER_DATA)
  mutationCharacterData({ args, context }: RecordingEvent) {
    const [nodeId, data] = args as [number, string];
    const node = this.getNode(this.toVNodeId(nodeId, context));
    node.data = data;
  }

  @Type(RecordingEventType.MUTATION_ATTRIBUTE)
  mutationAttribute({ args, context }: RecordingEvent) {
    const [nodeId, attrNamespace, attrName, attrValue] = args as [number, string, string, string];
    // TODO: handle namespaceURI
    const node = this.getNode(this.toVNodeId(nodeId, context));
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

  @Type(RecordingEventType.ATTACH_SHADOW)
  attachShadow({ args, context }: RecordingEvent) {
    const [targetId, serializedShadow] = args as [number, SerializedNode];
    const nodeId = this.toVNodeId(targetId, context);
    const node = this.getNode(nodeId);
    node.shadowRoot = this.toVNode(serializedShadow, context, nodeId);
  }

  @Type(RecordingEventType.INPUT_TEXT)
  inputText({ args, context }: RecordingEvent) {
    const [nodeId, text] = args as [number, string];
    const node = this.getNode(this.toVNodeId(nodeId, context));
    node.value = text;
  }

  @Type(RecordingEventType.INPUT_CHECKABLE)
  inputCheck({ args, context }: RecordingEvent) {
    const [nodeId, checked] = args as [number, boolean];
    const node = this.getNode(this.toVNodeId(nodeId, context));
    node.checked = checked;
  }

  @Type(RecordingEventType.INPUT_SELECT)
  inputSelect({ args, context }: RecordingEvent) {
    const [nodeId, selectedIndex] = args as [number, number];
    const node = this.getNode(this.toVNodeId(nodeId, context));
    node.selectedIndex = selectedIndex;
  }

  @Type(RecordingEventType.SCROLL)
  scroll({ args, context }: RecordingEvent) {
    const [nodeId, left, top] = args as [number, number, number];
    const node = this.getNode(this.toVNodeId(nodeId, context));
    node.scrollTop = top;
    node.scrollLeft = left;
  }

  @Type(RecordingEventType.MOUSE_DOWN)
  mouseDown() {
    this.state.cursor = { ...this.state.cursor, isPressed: true };
  }

  @Type(RecordingEventType.MOUSE_UP)
  mouseUp() {
    this.state.cursor = { ...this.state.cursor, isPressed: false };
  }

  @Type(RecordingEventType.MOUSE_OVER)
  mouseOver(event: RecordingEvent) {
    const [nodeId] = event.args as [number];
    this.state.cursor = { ...this.state.cursor, hover: this.toVNodeId(nodeId, event.context) };
  }

  @Type(RecordingEventType.MOUSE_MOVE)
  mouseMove(event: RecordingEvent) {
    const [x, y] = event.args as [number, number];
    this.state.cursor = { ...this.state.cursor, x, y };
  }

  @Type(RecordingEventType.TOUCH_START)
  touchStart(event: RecordingEvent) {
    const [fingerId, x, y] = event.args as [number, number, number];
    this.state.touches = [...this.state.touches, { id: fingerId, x, y }];
  }

  @Type(RecordingEventType.TOUCH_MOVE)
  touchMove(event: RecordingEvent) {
    const [fingerId, x, y] = event.args as [number, number, number];
    const index = this.state.touches.findIndex((touch) => touch.id === fingerId);
    this.state.touches[index] = {
      ...this.state.touches[index],
      x,
      y,
    };
    this.state.touches = [...this.state.touches];
  }

  @Type(RecordingEventType.TOUCH_END)
  @Type(RecordingEventType.TOUCH_CANCEL)
  touchEnd(event: RecordingEvent) {
    const [fingerId] = event.args as [number];
    this.state.touches = this.state.touches.filter(touch => touch.id !== fingerId);
  }

  @Type(RecordingEventType.CUSTOM_ELEMENT_REGISTRATION)
  customElementRegistration(event: RecordingEvent) {
    const [localName] = event.args as [string];
    this.state.customElements = new Set([...this.state.customElements, localName]);
  }

  @Type(RecordingEventType.RESIZE)
  resize(event: RecordingEvent) {
    const [width, height] = event.args as [number, number];
    this.state.viewport = { width, height };
  }

  // TODO: handle all other events

  apply(events: RecordingEvent[]) {
    let isDirtyState = false;
    for (const event of events) {
      const method = getMethodName(event.type);
      if (method) {
        (this[method] as any)(event);
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

  private toVNode({ csId, children, shadowRoot, contentDocument, attributes, ...props }: SerializedNode, context: string | undefined, parentId?: VNodeId): VNode {
    const id = this.toVNodeId(csId, context);
    const node: VNode = {
      id,
      children: children?.map((child: SerializedNode) => this.toVNode(child, context, id)),
      shadowRoot: shadowRoot && this.toVNode(shadowRoot, context, id),
      contentDocument: contentDocument && this.toVNode(contentDocument, id, id),
      attributes,
      parentId,
      ...props,
    };
    this.nodes[id] = node;
    return node;
  }
}

function getMethodName(eventType: RecordingEventType): keyof CSDom | undefined {
  return (CSDom as any).__events[eventType];
}
