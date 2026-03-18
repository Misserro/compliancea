"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, ClipboardCheck, Settings, MessageSquare, Layers, Shield, LayoutDashboard, Sun, Moon, Monitor, Users, LogOut, ListChecks } from "lucide-react";
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

function ThemeIcon({ theme }: { theme: string | undefined }) {
  if (theme === "dark") return <Moon className="h-4 w-4" />;
  if (theme === "light") return <Sun className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}


export function AppSidebar() {
  const pathname = usePathname();
  const [overdueCount, setOverdueCount] = useState(0);
  const { theme, setTheme } = useTheme();
  const { data: sessionData } = useSession();
  const userEmail = sessionData?.user?.email ?? "";
  const userName = sessionData?.user?.name || userEmail;
  const isAdmin = sessionData?.user?.role === "admin";

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
          <h1 className="text-lg font-semibold tracking-tight">
            ComplianceA
          </h1>
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

        {/* Documents Hub */}
        <SidebarGroup>
          <SidebarGroupLabel>Documents Hub</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                { title: "Documents", href: "/documents", icon: FileText },
                { title: "Policies", href: "/policies", icon: Shield },
                { title: "Analyze & Process", href: "/document-tools", icon: Layers },
                { title: "Ask Library", href: "/ask", icon: MessageSquare },
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bottom standalones */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                { title: "Settings", href: "/settings", icon: Settings },
                ...(isAdmin ? [{ title: "Users", href: "/users", icon: Users }] : []),
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t px-4 py-3 space-y-1">
        {userEmail && (
          <div className="px-2 py-2 border-b mb-1">
            <p className="text-sm font-medium truncate">{userName}</p>
            {userName !== userEmail && (
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            )}
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
