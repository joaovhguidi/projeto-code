import {
  ArrowDownUp, BadgeDollarSign, BarChart3, BriefcaseBusiness, CalendarClock, CalendarDays, CalendarPlus, Car, Circle, CirclePlus, ClipboardList, Coffee, Cog,
  Cpu, Dumbbell, Factory, FilePlus2, FileText, FolderLock, Globe, HandCoins, HardHat, HeartHandshake, LayoutDashboard, LifeBuoy, Lightbulb, ListChecks,
  ListPlus, MessageSquareWarning, Package, PackagePlus, Palette, PawPrint, PenTool, Receipt, Scissors, Settings, Shirt, ShoppingBasket, ShoppingCart,
  Smartphone, Sparkles, SprayCan, Stethoscope, Store, Trash2, Truck, UserPlus, UserRound, Users, UtensilsCrossed, Wallet, Wrench, type LucideProps,
} from 'lucide-react';

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  ArrowDownUp, BadgeDollarSign, BarChart3, BriefcaseBusiness, CalendarClock, CalendarDays, CalendarPlus, Car, CirclePlus, ClipboardList, Coffee, Cog,
  Cpu, Dumbbell, Factory, FilePlus2, FileText, FolderLock, Globe, HandCoins, HardHat, HeartHandshake, LayoutDashboard, LifeBuoy, Lightbulb, ListChecks,
  ListPlus, MessageSquareWarning, Package, PackagePlus, Palette, PawPrint, PenTool, Receipt, Scissors, Settings, Shirt, ShoppingBasket, ShoppingCart,
  Smartphone, Sparkles, SprayCan, Stethoscope, Store, Trash2, Truck, UserPlus, UserRound, Users, UtensilsCrossed, Wallet, Wrench,
};

/** Ícones referenciados por nome nos catálogos de módulos, segmentos e ações rápidas. */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = ICONS[name] ?? Circle;
  return <Cmp aria-hidden {...props} />;
}
