import AuthScreen from "./pages/AuthScreen";
import HomePage from "./pages/HomePage";
import WorkspacePage from "./pages/WorkspacePage";

function pathName() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path || "/";
}

export default function App() {
  const path = pathName();
  if (path === "/app") return <WorkspacePage />;
  if (path === "/login" || path === "/register" || path === "/verify" || path === "/forgot" || path === "/reset") {
    return <AuthScreen path={path} />;
  }
  return <HomePage />;
}
