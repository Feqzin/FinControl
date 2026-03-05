import {
  SiNubank, SiNetflix, SiSpotify, SiAmazon, SiYoutube, SiApple,
  SiGoogle, SiHbo, SiPaypal, SiPicpay, SiMercadopago, SiPagseguro,
  SiAmazonprime
} from "react-icons/si";
import { CreditCard } from "lucide-react";

interface BrandIconInfo {
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  color: string;
  label?: string;
}

const makeLetterIcon = (text: string) =>
  function LetterIcon({ className }: { className?: string }) {
    return <span className={`font-bold text-xs leading-none ${className || ""}`}>{text}</span>;
  };

export const LIBRARY_ICONS: {
  key: string;
  label: string;
  category: "bancos" | "servicos" | "carteiras";
  info: BrandIconInfo;
}[] = [
  { key: "nubank",      label: "Nubank",       category: "bancos",    info: { icon: SiNubank,      bg: "bg-purple-600", color: "text-white" } },
  { key: "mercadopago", label: "Mercado Pago", category: "bancos",    info: { icon: SiMercadopago, bg: "bg-sky-500",    color: "text-white" } },
  { key: "itau",        label: "Itaú",         category: "bancos",    info: { icon: makeLetterIcon("IT"), bg: "bg-orange-500", color: "text-white" } },
  { key: "bb",          label: "Banco do Brasil", category: "bancos", info: { icon: makeLetterIcon("BB"), bg: "bg-yellow-500", color: "text-black" } },
  { key: "caixa",       label: "Caixa",        category: "bancos",    info: { icon: makeLetterIcon("CX"), bg: "bg-blue-700",   color: "text-white" } },
  { key: "bradesco",    label: "Bradesco",     category: "bancos",    info: { icon: makeLetterIcon("BD"), bg: "bg-red-600",    color: "text-white" } },
  { key: "inter",       label: "Inter",        category: "bancos",    info: { icon: makeLetterIcon("IN"), bg: "bg-orange-400", color: "text-white" } },
  { key: "santander",   label: "Santander",    category: "bancos",    info: { icon: makeLetterIcon("SN"), bg: "bg-red-700",    color: "text-white" } },
  { key: "netflix",     label: "Netflix",      category: "servicos",  info: { icon: SiNetflix,     bg: "bg-red-600",    color: "text-white" } },
  { key: "spotify",     label: "Spotify",      category: "servicos",  info: { icon: SiSpotify,     bg: "bg-green-500",  color: "text-white" } },
  { key: "amazon",      label: "Amazon",       category: "servicos",  info: { icon: SiAmazon,      bg: "bg-orange-400", color: "text-black" } },
  { key: "amazonprime", label: "Amazon Prime", category: "servicos",  info: { icon: SiAmazonprime, bg: "bg-sky-700",    color: "text-white" } },
  { key: "youtube",     label: "YouTube",      category: "servicos",  info: { icon: SiYoutube,     bg: "bg-red-500",    color: "text-white" } },
  { key: "apple",       label: "Apple",        category: "servicos",  info: { icon: SiApple,       bg: "bg-gray-800",   color: "text-white" } },
  { key: "google",      label: "Google",       category: "servicos",  info: { icon: SiGoogle,      bg: "bg-blue-500",   color: "text-white" } },
  { key: "disney",      label: "Disney+",      category: "servicos",  info: { icon: makeLetterIcon("D+"), bg: "bg-blue-800",  color: "text-white" } },
  { key: "hbo",         label: "HBO Max",      category: "servicos",  info: { icon: SiHbo,         bg: "bg-indigo-700", color: "text-white" } },
  { key: "paypal",      label: "PayPal",       category: "carteiras", info: { icon: SiPaypal,      bg: "bg-blue-600",   color: "text-white" } },
  { key: "picpay",      label: "PicPay",       category: "carteiras", info: { icon: SiPicpay,      bg: "bg-green-600",  color: "text-white" } },
  { key: "pagseguro",   label: "PagSeguro",    category: "carteiras", info: { icon: SiPagseguro,   bg: "bg-green-700",  color: "text-white" } },
];

const ICON_KEY_MAP = new Map(LIBRARY_ICONS.map((e) => [e.key, e.info]));

export function getIconByKey(key: string): BrandIconInfo {
  return ICON_KEY_MAP.get(key) ?? { icon: CreditCard, bg: "bg-muted", color: "text-muted-foreground" };
}

export function getBrandIcon(name: string): BrandIconInfo {
  const n = name.toLowerCase();
  if (n.includes("nubank"))                              return getIconByKey("nubank");
  if (n.includes("mercado pago") || n.includes("mercadopago")) return getIconByKey("mercadopago");
  if (n.includes("itau") || n.includes("itaú"))         return getIconByKey("itau");
  if (n.includes("banco do brasil"))                     return getIconByKey("bb");
  if (n.includes("caixa") || n.includes("cef"))         return getIconByKey("caixa");
  if (n.includes("bradesco"))                            return getIconByKey("bradesco");
  if (n.includes("inter") && !n.includes("internacional")) return getIconByKey("inter");
  if (n.includes("santander"))                           return getIconByKey("santander");
  if (n.includes("netflix"))                             return getIconByKey("netflix");
  if (n.includes("spotify"))                             return getIconByKey("spotify");
  if (n.includes("amazon prime") || n.includes("prime")) return getIconByKey("amazonprime");
  if (n.includes("amazon"))                              return getIconByKey("amazon");
  if (n.includes("youtube"))                             return getIconByKey("youtube");
  if (n.includes("apple") || n.includes("icloud"))      return getIconByKey("apple");
  if (n.includes("google"))                              return getIconByKey("google");
  if (n.includes("disney"))                              return getIconByKey("disney");
  if (n.includes("hbo") || n.includes("max"))            return getIconByKey("hbo");
  if (n.includes("paypal"))                              return getIconByKey("paypal");
  if (n.includes("picpay"))                              return getIconByKey("picpay");
  if (n.includes("pagseguro"))                           return getIconByKey("pagseguro");
  return { icon: CreditCard, bg: "bg-muted", color: "text-muted-foreground" };
}

function resolveIconInfo(name: string, iconeId?: string | null): BrandIconInfo {
  if (!iconeId) return getBrandIcon(name);
  if (iconeId.startsWith("data:")) return { icon: CreditCard, bg: "bg-muted", color: "text-muted-foreground" };
  return getIconByKey(iconeId);
}

export function BrandIconDisplay({
  name,
  iconeId,
  size = "md",
}: {
  name: string;
  iconeId?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = { sm: "w-7 h-7", md: "w-9 h-9", lg: "w-12 h-12" };
  const iconSize = { sm: "w-3.5 h-3.5", md: "w-4 h-4", lg: "w-6 h-6" };

  if (iconeId && iconeId.startsWith("data:")) {
    return (
      <div className={`flex items-center justify-center rounded-lg flex-shrink-0 overflow-hidden ${sizeClasses[size]} bg-muted`}>
        <img src={iconeId} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }

  const info = resolveIconInfo(name, iconeId);
  const Icon = info.icon;
  return (
    <div className={`flex items-center justify-center rounded-lg flex-shrink-0 ${sizeClasses[size]} ${info.bg} ${info.color}`}>
      <Icon className={iconSize[size]} />
    </div>
  );
}
