"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PERMISSIONS, PERMISSION_KEYS, type Permission } from "@/lib/permissions";
import {
  createRole,
  createStaff,
  deleteRole,
  resetStaffMfa,
  setStaffActive,
  updateRole,
  updateStaff,
  unlockStaffAccount,
  updateCounterLimits,
  type CounterLimits,
  type RoleSummary,
  type StaffMember,
} from "@/lib/actions/staff";
import type { UserRole } from "@/generated/prisma/client";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import type { StepUp } from "@/lib/actions/staff";
import { humanizeWait } from "@/lib/login-throttle-format";
import {
  KeyRound,
  Lock,
  LockOpen,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";

const BASE_ROLES: { value: UserRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "counter_staff", label: "Counter Staff" },
];

export function StaffManager({
  staff,
  roles,
  counterLimits,
}: {
  staff: StaffMember[];
  roles: RoleSummary[];
  counterLimits: CounterLimits;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);
  const [creatingRole, setCreatingRole] = useState(false);

  // Nothing here runs until the owner has re-entered their password and a
  // fresh authenticator code: the action is parked, the prompt is shown, and
  // only the confirmed credentials complete it.
  const [pendingAction, setPendingAction] = useState<{
    fn: (reauth: StepUp) => Promise<void>;
    ok: string;
  } | null>(null);

  function run(fn: (reauth: StepUp) => Promise<void>, ok: string) {
    setPendingAction({ fn, ok });
  }

  function confirm(reauth: StepUp) {
    if (!pendingAction) return;
    startTransition(async () => {
      try {
        await pendingAction.fn(reauth);
        toast.success(pendingAction.ok);
        setPendingAction(null);
        setEditing(null);
        setCreating(false);
        setEditingRole(null);
        setCreatingRole(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Staff &amp; roles</h1>
        <p className="text-sm text-muted-foreground">
          Only the owner can see or change this. Deactivated staff keep their history but cannot
          sign in.
        </p>
      </div>

      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">Team members</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="limits">Counter limits</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="pt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {staff.length} account{staff.length === 1 ? "" : "s"}
              </CardTitle>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Add staff
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>MFA</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => (
                    <TableRow key={member.id} className={cn(!member.isActive && "opacity-60")}>
                      <TableCell className="font-medium">
                        {member.name}
                        {member.isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.roleName}</Badge>
                      </TableCell>
                      <TableCell>
                        {member.totpEnabled ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success">
                            <ShieldCheck className="h-3.5 w-3.5" /> On
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not set up</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!member.isActive ? (
                          <span className="text-xs text-destructive">Deactivated</span>
                        ) : member.lockedForSeconds > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive">
                            <Lock className="h-3.5 w-3.5" />
                            Locked {humanizeWait(member.lockedForSeconds)}
                          </span>
                        ) : (
                          <span className="text-xs">Active</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${member.name}`}
                            onClick={() => setEditing(member)}
                          >
                            <UserCog className="h-4 w-4" />
                          </Button>
                          {member.lockedForSeconds > 0 && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={pending}
                              aria-label={`Unlock ${member.name}`}
                              title="Clear the lockout so they can try again"
                              onClick={() =>
                                startTransition(async () => {
                                  try {
                                    await unlockStaffAccount(member.id);
                                    toast.success(`${member.name} unlocked`);
                                    router.refresh();
                                  } catch (e) {
                                    toast.error(
                                      e instanceof Error ? e.message : "Could not unlock"
                                    );
                                  }
                                })
                              }
                            >
                              <LockOpen className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={pending || !member.totpEnabled}
                            aria-label={`Reset MFA for ${member.name}`}
                            title="Reset MFA — the next sign-in enrols afresh"
                            onClick={() =>
                              run((auth) => resetStaffMfa(member.id, auth), `MFA reset for ${member.name}`)
                            }
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          {!member.isSelf && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={pending}
                              aria-label={member.isActive ? "Deactivate" : "Reactivate"}
                              onClick={() =>
                                run(
                                  (auth) => setStaffActive(member.id, !member.isActive, auth),
                                  member.isActive ? "Account deactivated" : "Account reactivated"
                                )
                              }
                            >
                              {member.isActive ? (
                                <UserRoundX className="h-4 w-4 text-destructive" />
                              ) : (
                                <UserRoundCheck className="h-4 w-4 text-success" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="pt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {roles.length} role{roles.length === 1 ? "" : "s"}
              </CardTitle>
              <Button size="sm" onClick={() => setCreatingRole(true)}>
                <Plus className="h-4 w-4" /> New role
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{role.name}</span>
                      {role.isSystem && <Badge variant="outline">Built-in</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {role.memberCount} member{role.memberCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {role.permissions.length === PERMISSION_KEYS.length
                        ? "Everything"
                        : role.permissions
                            .map((p) => PERMISSIONS[p])
                            .filter(Boolean)
                            .join(" · ") || "No permissions yet"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditingRole(role)}>
                      Edit
                    </Button>
                    {!role.isSystem && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={`Delete ${role.name}`}
                        onClick={() => run((auth) => deleteRole(role.id, auth), "Role deleted")}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="limits" className="pt-4">
          <CounterLimitsPanel
            initial={counterLimits}
            onSave={(values) => run((auth) => updateCounterLimits(values, auth), "Counter limits updated")}
          />
        </TabsContent>
      </Tabs>

      {(creating || editing) && (
        <StaffDialog
          member={editing}
          roles={roles}
          pending={pending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(values) =>
            run(
              (auth) =>
                editing ? updateStaff(editing.id, values, auth) : createStaff(values, auth),
              editing ? "Staff member updated" : "Staff member added"
            )
          }
        />
      )}

      {pendingAction && (
        <StepUpDialog
          pending={pending}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirm}
        />
      )}

      {(creatingRole || editingRole) && (
        <RoleDialog
          role={editingRole}
          pending={pending}
          onClose={() => {
            setCreatingRole(false);
            setEditingRole(null);
          }}
          onSave={(values) =>
            run(
              (auth) =>
                editingRole
                  ? updateRole(editingRole.id, values, auth)
                  : createRole(values, auth),
              editingRole ? "Role updated" : "Role created"
            )
          }
        />
      )}
    </div>
  );
}

function StaffDialog({
  member,
  roles,
  pending,
  onClose,
  onSave,
}: {
  member: StaffMember | null;
  roles: RoleSummary[];
  pending: boolean;
  onClose: () => void;
  onSave: (values: {
    name: string;
    email: string;
    role: UserRole;
    roleId: string | null;
    password?: string;
  }) => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState<UserRole>(member?.role ?? "counter_staff");
  const [roleId, setRoleId] = useState<string>(member?.roleId ?? "__none");
  const [password, setPassword] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member ? `Edit ${member.name}` : "Add staff"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">Name</Label>
            <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-email">Email (used to sign in)</Label>
            <Input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Base role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Owners always have full access, whatever role is attached.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Permission role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Use the base role&apos;s defaults</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-password">
              {member ? "New password (leave blank to keep)" : "Password"}
            </Label>
            <Input
              id="staff-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={pending || !name.trim() || !email.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                email: email.trim(),
                role,
                roleId: roleId === "__none" ? null : roleId,
                password: password || undefined,
              })
            }
          >
            {member ? "Save changes" : "Add staff member"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({
  role,
  pending,
  onClose,
  onSave,
}: {
  role: RoleSummary | null;
  pending: boolean;
  onClose: () => void;
  onSave: (values: { name: string; permissions: Permission[] }) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [permissions, setPermissions] = useState<Permission[]>(role?.permissions ?? []);

  function toggle(key: Permission) {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Role name</Label>
            <Input
              id="role-name"
              value={name}
              disabled={role?.isSystem}
              onChange={(e) => setName(e.target.value)}
            />
            {role?.isSystem && (
              <p className="text-xs text-muted-foreground">
                Built-in roles keep their name so they stay recognisable — their permissions are
                still yours to change.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Permissions</Label>
            <div className="space-y-2 rounded-lg border p-3">
              {PERMISSION_KEYS.map((key) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={permissions.includes(key)}
                    onCheckedChange={() => toggle(key)}
                  />
                  <span>{PERMISSIONS[key]}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Adding staff and editing roles is not on this list — that stays with the owner.
            </p>
          </div>
          <Button
            className="w-full"
            disabled={pending || !name.trim()}
            onClick={() => onSave({ name: name.trim(), permissions })}
          >
            {role ? "Save role" : "Create role"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Password plus a live authenticator code, re-entered for each change.
 * Being signed in isn't enough to hand out access — an unattended till with
 * an owner session open would otherwise be sufficient.
 */
function StepUpDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reauth: StepUp) => void;
}) {
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm it&apos;s you</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Changing staff access needs your password and a current authenticator code.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="stepup-password">Your password</Label>
            <Input
              id="stepup-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Authenticator code</Label>
            <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode}>
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button
            className="w-full"
            disabled={pending || !password || totpCode.length !== 6}
            onClick={() => onConfirm({ password, totpCode })}
          >
            Confirm and apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The three controls that decide what a member of staff may do without
 * asking. Saving routes through the same step-up prompt as everything else
 * on this screen — the owner re-enters their password and a fresh code.
 */
function CounterLimitsPanel({
  initial,
  onSave,
}: {
  initial: CounterLimits;
  onSave: (values: {
    staffDiscountCapPercent: number;
    salesReturnWindowDays: number;
    managerPin?: string;
  }) => void;
}) {
  const [cap, setCap] = useState(String(initial.staffDiscountCapPercent));
  const [returnDays, setReturnDays] = useState(String(initial.salesReturnWindowDays));
  const [pin, setPin] = useState("");

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Counter limits</h2>
        <p className="text-xs text-muted-foreground">
          What staff can do without asking. Saving asks for your password and an authenticator
          code, and the change is written to the audit log.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cap">Staff discount cap (%)</Label>
          <Input id="cap" type="number" value={cap} onChange={(e) => setCap(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">
            Above this, the till asks for the manager PIN.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="return-days">Sales return window (days)</Label>
          <Input
            id="return-days"
            type="number"
            value={returnDays}
            onChange={(e) => setReturnDays(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            0 switches customer returns off entirely.
          </p>
        </div>
      </div>

      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="pin">Manager PIN</Label>
        <Input
          id="pin"
          type="password"
          placeholder={initial.hasManagerPin ? "Set — leave blank to keep" : "Not set"}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Approves over-cap discounts and every customer return.
        </p>
      </div>

      <Button
        onClick={() => {
          onSave({
            staffDiscountCapPercent: Number(cap),
            salesReturnWindowDays: Number(returnDays),
            managerPin: pin || undefined,
          });
          setPin("");
        }}
      >
        <ShieldCheck className="h-4 w-4" />
        Save counter limits
      </Button>
    </div>
  );
}
