import Canvas from './components/Canvas';
import { ToastProvider } from './components/Toast';
import { AuthModalHost } from './components/AuthModalHost';

function App() {
  return (
    <ToastProvider>
      <div className="w-screen h-screen overflow-hidden" style={{ background: "transparent" }}>
        <Canvas />
      </div>
      {/* In-tree auth modal (ARCH-5) — authenticate() triggers it via a registered opener */}
      <AuthModalHost />
    </ToastProvider>
  );
}

export default App;