"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, ClipboardCheck, Settings, Layers, Shield, LayoutDashboard, Sun, Moon, Monitor, Users, LogOut, ListChecks, Scale, Building2, Check, ChevronDown, ChevronRight } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarSeparator,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "./language-switcher";
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
  const t = useTranslations("Common");
  const tSidebar = useTranslations("Sidebar");
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

  // Feature flag gating: super admins see everything; undefined = all enabled (graceful fallback)
  function canAccessFeature(feature: string): boolean {
    if (sessionData?.user?.isSuperAdmin) return true;
    const orgFeatures = sessionData?.user?.orgFeatures;
    if (!orgFeatures) return true;
    return orgFeatures.includes(feature);
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
                  tooltip={tSidebar("dashboard")}
                >
                  <Link href="/dashboard">
                    <LayoutDashboard />
                    <span>{tSidebar("dashboard")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Hub Categories */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Contract Category */}
              {canView('contracts') && canAccessFeature('contracts') && (
              <SidebarMenuItem>
                <Collapsible defaultOpen className="group/collapsible">
                  <div className="flex items-center">
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/contracts" || pathname.startsWith("/contracts/")}
                      tooltip={tSidebar("contract")}
                    >
                      <Link href="/contracts">
                        <ClipboardCheck />
                        <span>{tSidebar("contract")}</span>
                      </Link>
                    </SidebarMenuButton>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction showOnHover={false}>
                        <ChevronRight className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        <span className="sr-only">Toggle</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/contracts/list" || pathname.startsWith("/contracts/list/")}
                        >
                          <Link href="/contracts/list">
                            <ClipboardCheck />
                            <span>{tSidebar("contracts")}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/contracts/obligations" || pathname.startsWith("/contracts/obligations/")}
                        >
                          <Link href="/contracts/obligations">
                            <ListChecks />
                            <span>{tSidebar("obligations")}</span>
                            {overdueCount > 0 && (
                              <Badge
                                variant="destructive"
                                className="ml-auto h-5 min-w-5 px-1.5 text-xs"
                              >
                                {overdueCount}
                              </Badge>
                            )}
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
              )}

              {/* Legal Category */}
              {canView('legal_hub') && canAccessFeature('legal_hub') && (
              <SidebarMenuItem>
                <Collapsible defaultOpen className="group/collapsible">
                  <div className="flex items-center">
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/legal" || pathname.startsWith("/legal/")}
                      tooltip={tSidebar("legal")}
                    >
                      <Link href="/legal">
                        <Scale />
                        <span>{tSidebar("legal")}</span>
                      </Link>
                    </SidebarMenuButton>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction showOnHover={false}>
                        <ChevronRight className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        <span className="sr-only">Toggle</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/legal/cases" || pathname.startsWith("/legal/cases/")}
                        >
                          <Link href="/legal/cases">
                            <Scale />
                            <span>{tSidebar("cases")}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/legal/templates" || pathname.startsWith("/legal/templates/")}
                        >
                          <Link href="/legal/templates">
                            <FileText />
                            <span>{tSidebar("templates")}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {sessionData?.user?.orgRole !== "member" && (
                        <>
                          <SidebarSeparator className="my-1" />
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === "/legal/firm" || pathname.startsWith("/legal/firm/")}
                            >
                              <Link href="/legal/firm">
                                <Building2 />
                                <span>{tSidebar("myLawFirm")}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
              )}

              {/* Documents Category */}
              {canView('documents') && (
              <SidebarMenuItem>
                <Collapsible defaultOpen className="group/collapsible">
                  <div className="flex items-center">
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === "/documents" || pathname.startsWith("/documents/")}
                      tooltip={tSidebar("documents")}
                    >
                      <Link href="/documents">
                        <FileText />
                        <span>{tSidebar("documents")}</span>
                      </Link>
                    </SidebarMenuButton>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction showOnHover={false}>
                        <ChevronRight className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        <span className="sr-only">Toggle</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/documents/library" || pathname.startsWith("/documents/library/")}
                        >
                          <Link href="/documents/library">
                            <FileText />
                            <span>{tSidebar("documents")}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === "/documents/ai-tools" || pathname.startsWith("/documents/ai-tools/")}
                        >
                          <Link href="/documents/ai-tools">
                            <Layers />
                            <span>{tSidebar("aiTools")}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bottom standalones */}
        <SidebarGroup>
          <SidebarGroupLabel>{tSidebar("workspace")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                { title: tSidebar("settings"), href: "/settings", icon: Settings },
                { title: tSidebar("organization"), href: "/settings/org", icon: Building2 },
                { title: tSidebar("members"), href: "/org/members", icon: Users },
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
                    tooltip={tSidebar("admin")}
                  >
                    <Link href="/admin">
                      <Shield />
                      <span>{tSidebar("admin")}</span>
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
          <div className="px-2 py-2 border-b border-sidebar-border mb-1">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {orgName}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ redirectTo: "/login" })}
              className="mt-1 w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground px-0"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-xs">{t("signOut")}</span>
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={cycleTheme}
          className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          title="Toggle theme"
        >
          <ThemeIcon theme={theme} />
          <span className="text-xs">{themeLabel()}</span>
        </Button>
        <LanguageSwitcher />
      </SidebarFooter>
    </Sidebar>
  );
}
