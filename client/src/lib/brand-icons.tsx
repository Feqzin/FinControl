import {
  SiNubank, SiNetflix, SiSpotify, SiAmazon, SiYoutube, SiApple,
  SiGoogle, SiHbo, SiPaypal, SiPicpay, SiMercadopago, SiPagseguro,
  SiAmazonprime
} from "react-icons/si";
import { CreditCard, Smartphone, ShoppingBag, Music, Play } from "lucide-react";

interface BrandIconInfo {
  icon: React.ComponentType<{ className?: string }>;
  bg: string;       // Tailwind bg class (e.g. "bg-purple-600")
  color: string;    // Tailwind text class (e.g. "text-white")
  label?: string;   // Display name override
}

const makeLetterIcon = (text: string) =>
  function LetterIcon({ className }: { className?: string }) {
    return <span className={`font-bold text-xs ${className || ''}`}>{text}</span>;
  };

export function getBrandIcon(name: string): BrandIconInfo {
  const n = name.toLowerCase();

  if (n.includes("nubank")) {
    return { icon: SiNubank, bg: "bg-purple-600", color: "text-white" };
  }
  if (n.includes("mercado pago") || n.includes("mercadopago")) {
    return { icon: SiMercadopago, bg: "bg-sky-500", color: "text-white" };
  }
  if (n.includes("itau") || n.includes("itaú")) {
    return { icon: makeLetterIcon("IT"), bg: "bg-orange-500", color: "text-white" };
  }
  if (n.includes("banco do brasil") || n.includes("bb")) {
    return { icon: makeLetterIcon("BB"), bg: "bg-yellow-500", color: "text-black" };
  }
  if (n.includes("caixa") || n.includes("cef")) {
    return { icon: makeLetterIcon("CX"), bg: "bg-blue-700", color: "text-white" };
  }
  if (n.includes("bradesco")) {
    return { icon: makeLetterIcon("BD"), bg: "bg-red-600", color: "text-white" };
  }
  if (n.includes("inter") || n.includes("banco inter")) {
    return { icon: makeLetterIcon("IN"), bg: "bg-orange-400", color: "text-white" };
  }
  if (n.includes("santander")) {
    return { icon: makeLetterIcon("SN"), bg: "bg-red-700", color: "text-white" };
  }
  if (n.includes("netflix")) {
    return { icon: SiNetflix, bg: "bg-red-600", color: "text-white" };
  }
  if (n.includes("spotify")) {
    return { icon: SiSpotify, bg: "bg-green-500", color: "text-white" };
  }
  if (n.includes("amazon prime") || n.includes("prime")) {
    return { icon: SiAmazonprime, bg: "bg-sky-700", color: "text-white" };
  }
  if (n.includes("amazon")) {
    return { icon: SiAmazon, bg: "bg-orange-400", color: "text-black" };
  }
  if (n.includes("youtube")) {
    return { icon: SiYoutube, bg: "bg-red-500", color: "text-white" };
  }
  if (n.includes("apple") || n.includes("icloud") || n.includes("apple tv")) {
    return { icon: SiApple, bg: "bg-gray-800", color: "text-white" };
  }
  if (n.includes("google") || n.includes("google one")) {
    return { icon: SiGoogle, bg: "bg-blue-500", color: "text-white" };
  }
  if (n.includes("disney") || n.includes("disney+")) {
    return { icon: makeLetterIcon("D+"), bg: "bg-blue-800", color: "text-white" };
  }
  if (n.includes("hbo") || n.includes("max") || n.includes("hbo max")) {
    return { icon: SiHbo, bg: "bg-indigo-700", color: "text-white" };
  }
  if (n.includes("paypal")) {
    return { icon: SiPaypal, bg: "bg-blue-600", color: "text-white" };
  }
  if (n.includes("picpay")) {
    return { icon: SiPicpay, bg: "bg-green-600", color: "text-white" };
  }
  if (n.includes("pagseguro")) {
    return { icon: SiPagseguro, bg: "bg-green-700", color: "text-white" };
  }

  return { icon: CreditCard, bg: "bg-muted", color: "text-muted-foreground" };
}

export function BrandIconDisplay({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const info = getBrandIcon(name);
  const Icon = info.icon;
  const sizeClasses = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-12 h-12 text-base"
  };
  return (
    <div className={`flex items-center justify-center rounded-lg flex-shrink-0 ${sizeClasses[size]} ${info.bg} ${info.color}`}>
      <Icon className="w-4 h-4" />
    </div>
  );
}
