"use client";

import { useCallback, useEffect, useState } from "react";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchableSelect } from "@/components/searchable-select";
import type { ProvisionedIamUser, ListIamUsersResult } from "@/lib/aws/iam";

const selectClass =
  "w-full max-w-md rounded-md border border-(--border) bg-(--bg-field) px-2 py-1.5 text-xs text-(--text-primary) outline-none transition-colors focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30";

function formatAllCredentialsText(r: ProvisionedIamUser): string {
  return [
    `Console URL - ${r.signInUrl}`,
    `Username - ${r.username}`,
    `Password - ${r.password}`,
    "",
    `Access Key ID - ${r.accessKeyId}`,
    `Access Secret Key ID - ${r.secretAccessKey}`,
  ].join("\n");
}

export default function IamCreateUserPage() {
  const { region, profile } = useAwsWorkspace();
  const [newUserName, setNewUserName] = useState("");
  const [templateUserName, setTemplateUserName] = useState("");
  const [includeGroups, setIncludeGroups] = useState(false);
  const [users, setUsers] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<ProvisionedIamUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copyAllDone, setCopyAllDone] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!region) return;
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const params = new URLSearchParams({ region });
      if (profile?.trim()) params.set("profile", profile);
      const res = await fetch(`/api/iam/users?${params}`);
      if (!res.ok) throw new Error("Failed to load users");
      const data: ListIamUsersResult = await res.json();
      setUsers(data.users);
      if (data.truncated) {
        console.warn("User list was truncated");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load users";
      setUsersError(msg);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [region, profile]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !templateUserName) return;
    setShowConfirm(true);
  };

  const createUser = async () => {
    setCreating(true);
    setError(null);
    setShowConfirm(false);
    try {
      const res = await fetch("/api/iam/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          profile,
          newUserName,
          templateUserName,
          includeGroups,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create user");
      }
      setCopyAllDone(false);
      setResult(data);
      setNewUserName("");
      setTemplateUserName("");
      setIncludeGroups(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Brief toast could be added but kept minimal per plan
      console.log(`Copied ${label}`);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  const copyAllInformation = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(formatAllCredentialsText(result));
      setCopyAllDone(true);
      window.setTimeout(() => setCopyAllDone(false), 2000);
    } catch (err) {
      console.error("Copy all failed", err);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="font-(family-name:--font-display) text-2xl font-medium tracking-tight text-(--text-primary)">
          Create IAM User
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-(--text-secondary)">
          Create a new IAM user with console access, auto-generated password
          (reset on next login), and an access key pair. Permissions are copied
          from a template user.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-xs font-medium text-(--text-secondary) mb-1.5">
            New username
          </label>
          <input
            type="text"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            className={selectClass}
            placeholder="new-team-member"
            required
            disabled={creating}
          />
          <p className="mt-1 text-xs text-(--text-secondary)">
            Must be unique in the account
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-(--text-secondary) mb-1.5">
            Copy permissions from user
          </label>
          <SearchableSelect
            value={templateUserName}
            onValueChange={setTemplateUserName}
            className={selectClass}
            required
            disabled={loadingUsers || creating || users.length === 0}
            placeholder="Select a user to copy permissions from..."
            searchPlaceholder="Search users…"
            options={[
              { value: "", label: "Select a user to copy permissions from..." },
              ...users.map((user) => ({ value: user, label: user })),
            ]}
          />
          {loadingUsers && <p className="mt-1 text-xs text-(--text-secondary)">Loading users...</p>}
          {usersError && <p className="mt-1 text-xs text-(--danger)">{usersError}</p>}
          {users.length === 0 && !loadingUsers && !usersError && (
            <p className="mt-1 text-xs text-(--text-secondary)">No users found in this account/profile</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="includeGroups"
            checked={includeGroups}
            onChange={(e) => setIncludeGroups(e.target.checked)}
            disabled={creating}
            className="h-4 w-4 rounded border-(--border) text-(--accent) focus:ring-(--accent)"
          />
          <label htmlFor="includeGroups" className="text-sm text-(--text-primary)">
            Also add user to the same groups as the template user
          </label>
        </div>

        <button
          type="submit"
          disabled={creating || !newUserName || !templateUserName || loadingUsers}
          className="w-full rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Creating user..." : "Create IAM User with Console & Access Key"}
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-xl border border-(--danger)/30 bg-(--bg-surface) p-4 text-sm text-(--danger)">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 rounded-xl border border-(--border) bg-(--bg-field) p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-(--text-primary)">
              User created successfully
            </h3>
            <button
              type="button"
              onClick={copyAllInformation}
              className="shrink-0 rounded-lg border border-(--border) bg-(--bg-elevated) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors hover:bg-(--bg-hover)"
            >
              {copyAllDone ? "Copied" : "Copy all information"}
            </button>
          </div>
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-(--text-secondary) mb-0.5">Sign-in URL</div>
              <div className="flex items-center gap-2 font-(family-name:--font-mono) text-xs bg-(--bg-surface) p-2 rounded-md border border-(--border)">
                <span className="flex-1 break-all text-(--text-primary)">{result.signInUrl}</span>
                <button
                  onClick={() => copyToClipboard(result.signInUrl, "sign-in URL")}
                  className="text-(--accent) hover:text-(--accent)/80 px-2 py-0.5 text-xs font-medium"
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <div className="text-(--text-secondary) mb-0.5">Username</div>
              <div className="flex items-center gap-2 font-(family-name:--font-mono) text-xs bg-(--bg-surface) p-2 rounded-md border border-(--border)">
                <span className="flex-1 text-(--text-primary)">{result.username}</span>
                <button
                  onClick={() => copyToClipboard(result.username, "username")}
                  className="text-(--accent) hover:text-(--accent)/80 px-2 py-0.5 text-xs font-medium"
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <div className="text-(--text-secondary) mb-0.5">Password (change on first login)</div>
              <div className="flex items-center gap-2 font-(family-name:--font-mono) text-xs bg-(--bg-surface) p-2 rounded-md border border-(--border)">
                <span className="flex-1 text-(--text-primary) break-all">{result.password}</span>
                <button
                  onClick={() => copyToClipboard(result.password, "password")}
                  className="text-(--accent) hover:text-(--accent)/80 px-2 py-0.5 text-xs font-medium"
                >
                  Copy
                </button>
              </div>
              <p className="mt-1 text-xs text-(--text-secondary)">User will be required to set a new password on first sign-in.</p>
            </div>

            <div>
              <div className="text-(--text-secondary) mb-0.5">Access Key ID</div>
              <div className="flex items-center gap-2 font-(family-name:--font-mono) text-xs bg-(--bg-surface) p-2 rounded-md border border-(--border)">
                <span className="flex-1 text-(--text-primary)">{result.accessKeyId}</span>
                <button
                  onClick={() => copyToClipboard(result.accessKeyId, "access key ID")}
                  className="text-(--accent) hover:text-(--accent)/80 px-2 py-0.5 text-xs font-medium"
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <div className="text-(--text-secondary) mb-0.5">Secret Access Key</div>
              <div className="flex items-center gap-2 font-(family-name:--font-mono) text-xs bg-(--bg-surface) p-2 rounded-md border border-(--border)">
                <span className="flex-1 text-(--text-primary) break-all">{result.secretAccessKey}</span>
                <button
                  onClick={() => copyToClipboard(result.secretAccessKey, "secret access key")}
                  className="text-(--accent) hover:text-(--accent)/80 px-2 py-0.5 text-xs font-medium"
                >
                  Copy
                </button>
              </div>
              <p className="mt-1 text-xs text-(--danger)">Save this secret immediately. It will not be shown again.</p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-(--border) text-xs text-(--text-secondary)">
            Credentials have been created. The user must sign in at the URL above and will be prompted to change their password.
            <br />
            Consider enabling MFA for this user in the AWS console.
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        onConfirm={createUser}
        onCancel={() => setShowConfirm(false)}
        title="Create IAM User"
        message={`Create user "${newUserName}" copying permissions from "${templateUserName}"? This will also create console access with forced password reset and an access key pair.`}
        confirmLabel="Create User"
        loading={creating}
      />
    </div>
  );
}
