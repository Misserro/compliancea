"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Search, ClipboardCheck, Settings, MessageSquare, Layers, Shield, Package, LayoutDashboard, Sun, Moon, Monitor } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function ThemeIcon({ theme }: { theme: string | undefined }) {
  if (theme === "dark") return <Moon className="h-4 w-4" />;
  if (theme === "light") return <Sun className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Documents", href: "/documents", icon: FileText },
  { title: "Policies", href: "/policies", icon: Shield },
  { title: "Analyze", href: "/analyze", icon: Search },
  { title: "Ask Library", href: "/ask", icon: MessageSquare },
  { title: "Process", href: "/process", icon: Layers },
  { title: "Contracts", href: "/contracts", icon: ClipboardCheck },
  { title: "Product Hub", href: "/product-hub", icon: Package },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [overdueCount, setOverdueCount] = useState(0);
  const { theme, setTheme } = useTheme();

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
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.title}</span>
                    {item.href === "/contracts" && overdueCount > 0 && (
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
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t px-4 py-3">
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
