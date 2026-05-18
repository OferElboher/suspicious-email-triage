// TriageApp is the real product shell; App stays tiny for CRA compatibility.
import TriageApp from "./TriageApp";

// Global triage theme and layout styles are loaded once at the root.
import "./styles/triage.css";

// App is the top-level React component mounted by index.js.
export default function App() {
  // Delegate to the product shell so routing/navigation stays in one component.
  return <TriageApp />;
}
