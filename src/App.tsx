import { useMemo, useState } from 'react';
import { RenderDOM } from './RenderDOM'
import { CSDom } from './CSDom';
import { recordingEvents } from './events';

let prevRenderAt = 0;
const csDom = new CSDom();

function App() {
  const [renderAt, setRenderAt] = useState(recordingEvents.length);
  const virtualDOM = useMemo(() => {
    if (prevRenderAt > renderAt) {
      csDom.clear();
      prevRenderAt = 0;
      console.log('cleared vdom state');
    }
    const selectedEvents = recordingEvents.slice(prevRenderAt, renderAt);
    if (selectedEvents.length) {
      console.log('applied events:', selectedEvents);
      csDom.apply(selectedEvents);
    }
    prevRenderAt = renderAt;
    return csDom.getVirtualDOM();
  }, [renderAt]);

  return (<>
    <h1>
      render at index:
      <select value={renderAt} onChange={(event) => setRenderAt(+event.target.value)}>
        <option key={0} value={0}>{0}</option>
        {recordingEvents.map((_, index) => (<option key={index + 1} value={index + 1}>{index + 1}</option>))}
      </select>
    </h1>
    <RenderDOM vdom={virtualDOM}></RenderDOM>
  </>);
}

export default App
