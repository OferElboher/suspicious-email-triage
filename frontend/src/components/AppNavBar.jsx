/**
 * Primary app sub-window bar — icon-only tabs with hover labels (RBAC-filtered).
 *
 * Pattern: URL hash routing via parent setScreen; each item gated by permissions/roles.
 * Technology: NavIconButton + HoverHelp; screens defined in appScreenNavigation.js.
 */
import NavIconButton from "./NavIconButton";
import {
  IconAdmin,
  IconAgent,
  IconAnalytics,
  IconDashboard,
  IconFlow,
  IconGraph,
  IconLogs,
  IconSearchReviews,
  IconSettings,
} from "./NavIcons";

/**
 * @param {object} props
 * @param {string} props.screen — active screen id
 * @param {(id: string) => void} props.setScreen
 * @param {object} props.access — booleans for each tab
 */
export default function AppNavBar({ screen, setScreen, access }) {
  const {
    workspace,
    analytics,
    flow,
    agent,
    graph,
    search,
    logs,
    admin,
    settings,
  } = access;

  return (
    <nav className="nav-tabs nav-tabs--icons" aria-label="Primary views">
      {workspace && (
        <NavIconButton
          label="Review dashboard"
          active={screen === "workspace"}
          onClick={() => setScreen("workspace")}
        >
          <IconDashboard />
        </NavIconButton>
      )}
      {flow && (
        <NavIconButton
          label="Live flow dashboard"
          active={screen === "flow"}
          onClick={() => setScreen("flow")}
        >
          <IconFlow />
        </NavIconButton>
      )}
      {agent && (
        <NavIconButton
          label="Agent activity"
          active={screen === "agent"}
          onClick={() => setScreen("agent")}
        >
          <IconAgent />
        </NavIconButton>
      )}
      {analytics && (
        <NavIconButton
          label="Analytics & graphs"
          active={screen === "analytics"}
          onClick={() => setScreen("analytics")}
        >
          <IconAnalytics />
        </NavIconButton>
      )}
      {graph && (
        <NavIconButton
          label="Phishing graph"
          active={screen === "graph"}
          onClick={() => setScreen("graph")}
        >
          <IconGraph />
        </NavIconButton>
      )}
      {search && (
        <NavIconButton
          label="Search past reviews"
          active={screen === "search"}
          onClick={() => setScreen("search")}
        >
          <IconSearchReviews />
        </NavIconButton>
      )}
      {logs && (
        <NavIconButton
          label="Search unified logs"
          active={screen === "logs"}
          onClick={() => setScreen("logs")}
        >
          <IconLogs />
        </NavIconButton>
      )}
      {admin && (
        <NavIconButton
          label="User administration"
          active={screen === "admin"}
          onClick={() => setScreen("admin")}
        >
          <IconAdmin />
        </NavIconButton>
      )}
      {settings && (
        <NavIconButton
          label="Settings"
          active={screen === "settings"}
          onClick={() => setScreen("settings")}
        >
          <IconSettings />
        </NavIconButton>
      )}
    </nav>
  );
}
