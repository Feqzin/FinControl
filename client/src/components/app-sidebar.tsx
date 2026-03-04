import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard, Users, Receipt, CreditCard, Calendar,
  BarChart3, Repeat, LogOut, FileUp,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const menuItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Pessoas", url: "/pessoas", icon: Users },
  { title: "Dividas", url: "/dividas", icon: Receipt },
  { title: "Cartoes", url: "/cartoes", icon: CreditCard },
  { title: "Previsao", url: "/previsao", icon: Calendar },
  { title: "Servicos", url: "/servicos", icon: Repeat },
  { title: "Relatorios", url: "/relatorios", icon: BarChart3 },
  { title: "Importar", url: "/importar", icon: FileUp },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
            <Receipt className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">FinControl</span>
        </div>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.url.replace("/", "") || "dashboard"}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground truncate">{user?.username}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout.mutate()}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
