import { useMemo, useState } from 'react';
import { RenderDOM } from './RenderDOM'
import { PlaybackEngine } from './PlayerEngine';
import { recordingEvents } from './events';

const playerEngine = new PlaybackEngine();

function App() {
  const [renderAt, setRenderAt] = useState(recordingEvents.length);
  const virtualDOM = useMemo(() => {
    const events = recordingEvents.slice(0, renderAt);
    if (events.length === 0)
      playerEngine.clear();
    return playerEngine.apply(events).getVirtualDOM();
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
