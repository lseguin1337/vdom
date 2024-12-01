import ReactReconciler from 'react-reconciler';
import { DirtyElementBuilder } from './dirtyElementBuilder';

const rootHostContext = {};
const childHostContext = {};

const dirtyElementBuilder = new DirtyElementBuilder();
// const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

function appendChild(parent: Node, child: Node & { __shadowRoot?: any }) {
  if (child.nodeType === Node.DOCUMENT_FRAGMENT_NODE && child.__shadowRoot) {
    const { mode, adoptedStyleSheets } = child.__shadowRoot;
    const shadowRoot = (parent as Element).attachShadow({ mode });
    child.__shadowRoot = shadowRoot;
    shadowRoot.adoptedStyleSheets = adoptedStyleSheets || [];
    shadowRoot.appendChild(child);
  } else {
    parent.appendChild(child);
  }
}

function isXhtmlNamespace(namespaceURI: string | null) {
  return namespaceURI === XHTML_NAMESPACE;
}

function createElementNS(document, namespaceURI, localName) {
  namespaceURI = namespaceURI === undefined ? XHTML_NAMESPACE : namespaceURI;
  try {
    return isXhtmlNamespace(namespaceURI) && localName.indexOf(":") > -1
      ? document.createElement(localName)
      : document.createElementNS(namespaceURI, localName);
  } catch (e) {
    switch (e.name) {
      case "InvalidCharacterError":
        return dirtyElementBuilder.createElement(localName);
      default:
        throw e;
    }
  }
}

function removeAttributeNS(element, attr) {
  element.removeAttributeNS(attr.namespaceURI, attr.name);
}

function setAttributeNS(element, attr) {
  try {
    element.setAttributeNS(
      attr.namespaceURI,
      attr.name,
      attr.value,
    );
  } catch (e) {
    switch (e.name) {
      case "NamespaceError":
        element.setAttribute(
          attr.name,
          attr.value,
        );
        break;
      case "InvalidCharacterError":
        element.setAttributeNode(
          dirtyElementBuilder.createAttribute(
            attr.name,
            attr.value,
          ),
        );
        break;
      default:
        throw e;
    }
  }
}

function normalizeAttributes(attributes) {
  const attrs: Record<string, any> = {};
  if (!attributes || !(attributes instanceof Array)) return attrs;
  for (const attr of attributes)
    attrs[`${attr.namespaceURI}/${attr.name}`] = attr;
  return attrs;
}

function createDoctype(document: Document, qualifiedName: string, publicId: string, systemId: string) {
  try {
    return document.implementation.createDocumentType(qualifiedName, publicId, systemId);
  } catch (e) {
    if ("InvalidCharacterError" === e.name)
      return dirtyElementBuilder.createDoctype(qualifiedName, publicId, systemId);
    throw e;
  }
}

const ReactReconcilerInst = ReactReconciler({
  now: Date.now,
  getRootHostContext: () => {
    return rootHostContext;
  },
  prepareForCommit: () => {},
  resetAfterCommit: () => {},
  getChildHostContext: (...args) => {
    return childHostContext;
  },
  shouldSetTextContent: (type, props) => {
    // return typeof props.children === 'string' || typeof props.children === 'number';
    return false;
  },
  /**
   This is where react-reconciler wants to create an instance of UI element in terms of the target. Since our target here is the DOM, we will create document.createElement and type is the argument that contains the type string like div or img or h1 etc. The initial values of domElement attributes can be set in this function from the newProps argument
   */
  createInstance: (type, { attributes, namespaceURI, children, ...newProps }, rootContainerInstance, _currentHostContext, workInProgress) => {
    const document = rootContainerInstance.ownerDocument || rootContainerInstance;
    
    switch (type) {
      case '#comment':
        return document.createComment(newProps?.data || '');
      case '#doctype':
        return createDoctype(document, newProps.qualifiedName, newProps.publicId, newProps.systemId);
      case '#shadowRoot':
        const fragment = document.createDocumentFragment();
        fragment.__shadowRoot = { mode: newProps.mode, adoptedStyleSheets: newProps.adoptedStyleSheets };
        return fragment;
    }

    // TODO: create element using namespaceURI
    const element = createElementNS(document, namespaceURI, type);

    // React props
    for (const propName of Object.keys(newProps)) {
      const propValue = newProps[propName];
      if (/^on/.test(propName) && typeof propValue === 'function') {
        element.addEventListener(propName.slice(2).toLowerCase(), propValue);
      } else if (propName === 'className') {
        element.setAttribute('class', propValue);
      } else if (propName === 'value') {
        element.value = propValue;
      } else {
        element.setAttribute(propName, propValue);
      }
    }

    // Native attributes
    if (attributes && attributes instanceof Array) {
      for (const attr of attributes)
        setAttributeNS(element, attr);
    }

    return element;
  },
  createTextInstance: text => {
    return document.createTextNode(text);
  },
  appendInitialChild: appendChild,
  appendChild: appendChild,
  appendChildToContainer: appendChild,
  finalizeInitialChildren: (domElement, type, props) => {
    return false;
  },
  supportsMutation: true,
  prepareUpdate(domElement, oldProps, newProps) {
    return true;
  },
  // instance, type, prevProps, nextProps, internalHandle
  commitUpdate(domElement, updatePayload, type, { namespaceURI: oldNamespaceURI, attributes: oldAttributes, ...oldProps }, { namespaceURI: newNamespaceURI, attributes: newAttributes, children, ...newProps }) {
    switch (type) {
      case '#comment':
        domElement.data = newProps.data || '';
        return;
      case '#doctype':
        console.warn('#doctype doesnt support mutation');
        return;
      case '#shadowRoot':
        if (oldProps.adoptedStyleSheets !== newProps.adoptedStyleSheets) {
          domElement.__shadowRoot.adoptedStyleSheets = newProps.adoptedStyleSheets || [];
        }
        return;
    }

    if (oldAttributes !== newAttributes) {
      const oldNativeAttributes = normalizeAttributes(oldAttributes);
      const newNativeAttributes = normalizeAttributes(newAttributes);
      
      Object.keys(oldNativeAttributes).forEach(propName => {
        if (!newNativeAttributes[propName]) {
          const attr = oldNativeAttributes[propName];
          removeAttributeNS(domElement, attr);
        }
      });

      Object.keys(newNativeAttributes).forEach(propName => {
        setAttributeNS(domElement, newNativeAttributes[propName]);
      });
    }
  
    Object.keys(oldProps).forEach(propName => {
      if (!newProps[propName]) {
        domElement.removeAttribute(propName);
      }
    });

    Object.keys(newProps).forEach(propName => {
      const propValue = newProps[propName];
      if (oldProps[propName] === propValue)
        return;
      if (propName.startsWith('on') && typeof propValue === 'function')
        return;

      if (propName === 'value' && 'value' in domElement) {
        domElement.value = propValue;
      } else {
        domElement.setAttribute(propName, propValue);
      }
    });
  },
  commitTextUpdate(textInstance, oldText, newText) {
    textInstance.text = newText;
  },
  removeChild(parentInstance, child) {
    child?.remove();
  },
  removeChildFromContainer(parentInstance, child) {
    child?.remove();
  },
  insertBefore(parentInstance, child, beforeChild) {
    parentInstance.insertBefore(child, beforeChild);
  },
  insertInContainerBefore(parentInstance, child, beforeChild) {
    parentInstance.insertBefore(child, beforeChild);
  },
  detachDeletedInstance(domElement) {
  },
  clearContainer(container) {
    while (container.firstChild)
      container.firstChild.remove();
  },
  getPublicInstance(instance) {
    return instance;
  }
});

export function createRoot(container) {
  let rootContainer;
  return {
    render(element) {
      if (!rootContainer) {
        rootContainer = ReactReconcilerInst.createContainer(container, false, false);
      }
      return ReactReconcilerInst.updateContainer(element, rootContainer, null);
    },
    unmount() {
      if (!rootContainer) throw new Error('not mounted');
      ReactReconcilerInst.updateContainer(null, rootContainer!, null);
      rootContainer = undefined;
    }
  }
}
