"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, ClipboardCheck, Settings, MessageSquare, Layers, Shield, LayoutDashboard, Sun, Moon, Monitor, Users, LogOut, ListChecks, Scale, Building2, Check, ChevronDown } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/permissions";

function ThemeIcon({ theme }: { theme: string | undefined }) {
  if (theme === "dark") return <Moon className="h-4 w-4" />;
  if (theme === "light") return <Sun className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}


interface OrgMembership {
  orgId: number;
  orgName: string;
  orgSlug: string;
  role: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [overdueCount, setOverdueCount] = useState(0);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);
  const { theme, setTheme } = useTheme();
  const { data: sessionData, update } = useSession();
  const userEmail = sessionData?.user?.email ?? "";
  const userName = sessionData?.user?.name || userEmail;
  const orgName = sessionData?.user?.orgName ?? "ComplianceA";
  const currentOrgId = sessionData?.user?.orgId;
  const permissions = sessionData?.user?.permissions;

  // Permission-based nav visibility: null/undefined = full access (owner/admin)
  function canView(resource: string): boolean {
    if (!permissions) return true;
    const level = PERMISSION_LEVELS[(permissions[resource] ?? 'full') as PermissionLevel] ?? 3;
    return level >= 1;
  }

  useEffect(() => {
    async function fetchOverdue() {
      try {
        const res = await fetch("/api/obligations?filter=all");
        if (res.ok) {
          const data = await res.json();
          setOverdueCount(data.stats?.overdue || 0);
        }
      } catch {
        // ignore
      }
    }
    fetchOverdue();
    const interval = setInterval(fetchOverdue, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function fetchMemberships() {
      try {
        const res = await fetch("/api/org/memberships");
        if (res.ok) {
          const data = await res.json();
          setMemberships(data.memberships ?? []);
        }
      } catch {
        // ignore — single-org fallback
      }
    }
    fetchMemberships();
  }, []);

  async function handleOrgSwitch(targetOrgId: number) {
    if (isSwitching) return;
    setIsSwitching(true);
    try {
      await update({ switchToOrgId: targetOrgId });
      router.refresh();
    } finally {
      setIsSwitching(false);
    }
  }

  function cycleTheme() {
    if (!theme) return;
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  }

  function themeLabel() {
    if (theme === "dark") return "Dark";
    if (theme === "light") return "Light";
    return "System";
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-2" />
          {memberships.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isSwitching}
                className="flex items-center gap-1 text-lg font-semibold tracking-tight truncate outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-md px-1 -mx-1"
              >
                {orgName}
                <ChevronDown className="size-4 text-muted-foreground shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {memberships.map((m) => (
                  <DropdownMenuItem
                    key={m.orgId}
                    onClick={() => {
                      if (Number(m.orgId) !== Number(currentOrgId)) {
                        handleOrgSwitch(m.orgId);
                      }
                    }}
                  >
                    <span className="truncate">{m.orgName}</span>
                    {Number(m.orgId) === Number(currentOrgId) && (
                      <Check className="ml-auto size-4 text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <h1 className="text-lg font-semibold tracking-tight truncate">
              {orgName}
            </h1>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 py-4">
        {/* Dashboard */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/dashboard" || pathname.startsWith("/dashboard/")}
                  tooltip="Dashboard"
                >
                  <Link href="/dashboard">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Contract Hub */}
        {canView('contracts') && (
        <SidebarGroup>
          <SidebarGroupLabel>Contract Hub</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/contracts" || pathname.startsWith("/contracts/")}
                  tooltip="Contracts"
                >
                  <Link href="/contracts">
                    <ClipboardCheck />
                    <span>Contracts</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/obligations" || pathname.startsWith("/obligations/")}
                  tooltip="Obligations"
                >
                  <Link href="/obligations">
                    <ListChecks />
                    <span>Obligations</span>
                    {overdueCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="ml-auto h-5 min-w-5 px-1.5 text-xs"
                      >
                        {overdueCount}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}

        {/* Legal Hub */}
        {canView('legal_hub') && (
        <SidebarGroup>
          <SidebarGroupLabel>Legal Hub</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/legal-hub" || (pathname.startsWith("/legal-hub/") && !pathname.startsWith("/legal-hub/templates"))}
                  tooltip="Cases"
                >
                  <Link href="/legal-hub">
                    <Scale />
                    <span>Cases</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/legal-hub/templates" || pathname.startsWith("/legal-hub/templates/")}
                  tooltip="Templates"
                >
                  <Link href="/legal-hub/templates">
                    <FileText />
                    <span>Templates</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}

        {/* Documents Hub */}
        {(() => {
          const docHubItems = [
            { title: "Documents", href: "/documents", icon: FileText, resource: "documents" },
            { title: "Policies", href: "/policies", icon: Shield, resource: "policies" },
            { title: "Analyze & Process", href: "/document-tools", icon: Layers, resource: "documents" },
            { title: "Ask Library", href: "/ask", icon: MessageSquare, resource: "documents" },
          ].filter((item) => canView(item.resource));

          return docHubItems.length > 0 ? (
            <SidebarGroup>
              <SidebarGroupLabel>Documents Hub</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {docHubItems.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null;
        })()}

        {/* Bottom standalones */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                { title: "Settings", href: "/settings", icon: Settings },
                { title: "Organization", href: "/settings/org", icon: Building2 },
                { title: "Members", href: "/org/members", icon: Users },
              ].map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {/* Admin panel — visible to super admins only */}
              {sessionData?.user?.isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/admin")}
                    tooltip="Admin Panel"
                  >
                    <Link href="/admin">
                      <Shield />
                      <span>Admin Panel</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t px-4 py-3 space-y-1">
        {userEmail && (
          <div className="px-2 py-2 border-b mb-1">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {orgName}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ redirectTo: "/login" })}
              className="mt-1 w-full justify-start gap-2 text-muted-foreground hover:text-foreground px-0"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-xs">Sign out</span>
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={cycleTheme}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          title="Toggle theme"
        >
          <ThemeIcon theme={theme} />
          <span className="text-xs">{themeLabel()}</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
