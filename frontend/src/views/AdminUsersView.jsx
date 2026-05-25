import { useEffect, useState } from "react";
import { getJson, patchJson, postJson } from "../api/client";

const ROLE_OPTIONS = ["admin", "analyst", "manager", "developer", "viewer"];

export default function AdminUsersView() {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState(["analyst"]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getJson("/admin/users");
      setUsers(data.users || []);
    } catch (err) {
      setStatus(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers().catch(() => {});
  }, []);

  const toggleRole = (role) => {
    setRoles((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
    );
  };

  const provision = async () => {
    setStatus("Creating user…");
    try {
      await postJson("/admin/users", { email: email.trim(), password, roles });
      setEmail("");
      setPassword("");
      setRoles(["analyst"]);
      setStatus("User created.");
      await loadUsers();
    } catch (err) {
      setStatus(err.body?.error || err.message || "Create failed");
    }
  };

  const updateUser = async (user) => {
    setStatus(`Updating ${user.email}…`);
    try {
      await patchJson(`/admin/users/${user.id}`, {
        isActive: user.isActive,
        roles: user.roles,
      });
      setStatus("User updated.");
      await loadUsers();
    } catch (err) {
      setStatus(err.body?.error || err.message || "Update failed");
    }
  };

  return (
    <section className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>User provisioning</h2>
      <p className="muted">Admin-managed accounts stored in PostgreSQL with role-based permissions.</p>

      <div className="row" style={{ marginTop: "0.75rem" }}>
        <div>
          <label className="field">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="field">Temporary password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <span className="field">Roles</span>
        <div className="role-grid">
          {ROLE_OPTIONS.map((role) => (
            <label key={role} className="role-chip">
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
              />{" "}
              {role}
            </label>
          ))}
        </div>
      </div>

      <div className="actions" style={{ marginTop: "0.75rem" }}>
        <button type="button" className="primary" onClick={() => provision().catch(() => {})}>
          Create user
        </button>
      </div>

      <h3 className="muted" style={{ marginTop: "1.5rem", fontSize: "0.95rem" }}>
        Existing users
      </h3>
      {loading && <p className="muted">Loading…</p>}
      <ul className="dashboard-list">
        {users.map((user) => (
          <li key={user.id}>
            <strong>{user.email}</strong>
            <div className="muted">Roles: {(user.roles || []).join(", ") || "none"}</div>
            <div className="toolbar" style={{ marginTop: "0.5rem" }}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(user.isActive)}
                  onChange={(e) =>
                    setUsers((rows) =>
                      rows.map((row) =>
                        row.id === user.id ? { ...row, isActive: e.target.checked } : row
                      )
                    )
                  }
                />{" "}
                Active
              </label>
              {ROLE_OPTIONS.map((role) => (
                <label key={`${user.id}-${role}`} className="role-chip">
                  <input
                    type="checkbox"
                    checked={(user.roles || []).includes(role)}
                    onChange={() =>
                      setUsers((rows) =>
                        rows.map((row) => {
                          if (row.id !== user.id) return row;
                          const nextRoles = row.roles.includes(role)
                            ? row.roles.filter((r) => r !== role)
                            : [...row.roles, role];
                          return { ...row, roles: nextRoles };
                        })
                      )
                    }
                  />{" "}
                  {role}
                </label>
              ))}
              <button type="button" onClick={() => updateUser(user)}>
                Save
              </button>
            </div>
          </li>
        ))}
      </ul>
      {status && <p className="muted">{status}</p>}
    </section>
  );
}
