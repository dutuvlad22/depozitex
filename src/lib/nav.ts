import {
  ChartColumn,
  KeyRound,
  LayoutDashboard,
  PackagePlus,
  Boxes,
  ClipboardList,
  Truck,
  RotateCcw,
  ScanBarcode,
  Users,
  Warehouse,
  Package,
  UserCog,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Panou", icon: LayoutDashboard },
  { href: "/picking", label: "Picking", icon: ScanBarcode },
  { href: "/clienti", label: "Clienti", icon: Users },
  { href: "/produse", label: "Produse", icon: Package },
  { href: "/depozite", label: "Depozite", icon: Warehouse },
  { href: "/receptie", label: "Receptie", icon: PackagePlus },
  { href: "/stoc", label: "Stoc", icon: Boxes },
  { href: "/comenzi", label: "Comenzi", icon: ClipboardList },
  { href: "/expediere", label: "Expediere", icon: Truck },
  { href: "/retururi", label: "Retururi", icon: RotateCcw },
  { href: "/rapoarte", label: "Rapoarte", icon: ChartColumn },
  { href: "/echipa", label: "Echipa", icon: UserCog },
  { href: "/setari/curier", label: "Setari curier", icon: Settings, adminOnly: true },
  { href: "/setari/api", label: "API clienti", icon: KeyRound, adminOnly: true },
];
