# React views (`frontend/src/views/`)

These components are mounted by `TriageApp.jsx` depending on the active navigation tab. Tab selection is stored in the URL hash (`#analytics`, `#logs`, `#settings`, …; workspace uses no hash) so browser refresh restores the same view.

**Navigation guide:** [docs/ui_guide_app_navigation.md](../../docs/ui_guide_app_navigation.md)

---

## Sub-windows

| View file | Hash | Hover label |
|-----------|------|-------------|
| *(inline in TriageApp)* | *(none)* | Review dashboard |
| `AnalyticsView.jsx` | `#analytics` | Analytics & graphs |
| `GraphView.jsx` | `#graph` | Phishing graph |
| `LogsView.jsx` | `#logs` | Search unified logs |
| `AdminView.jsx` | `#admin` | User administration |
| `SettingsView.jsx` | `#settings` | Settings |

User administration opens **Django admin** from `AdminView.jsx` — see [docs/auth_guide_django_admin_users.md](../../docs/auth_guide_django_admin_users.md).

---

## URL hash routes

See `../lib/appScreenNavigation.js` and `../hooks/useAppScreen.js`.
