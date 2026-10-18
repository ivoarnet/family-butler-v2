import { useState } from "react";
import ShoppingBasketOutlinedIcon from "@mui/icons-material/ShoppingBasketOutlined";

export const BRING_ICON_ORIGIN = "https://web.getbring.com";

// Only reviewed canonical assets: never send a household's free-text item name to the CDN.
const icons = new Map([
  ["milk", `${BRING_ICON_ORIGIN}/assets/images/items/milch.png`],
  ["milch", `${BRING_ICON_ORIGIN}/assets/images/items/milch.png`],
  ["eggs", `${BRING_ICON_ORIGIN}/assets/images/items/eier.png`],
  ["eier", `${BRING_ICON_ORIGIN}/assets/images/items/eier.png`],
  ["bread", `${BRING_ICON_ORIGIN}/assets/images/items/brot.png`],
  ["brot", `${BRING_ICON_ORIGIN}/assets/images/items/brot.png`],
]);

export const groceryIconUrl = (name: string) => icons.get(name.trim().toLowerCase());

export function GroceryProductIcon({ name }: { name: string }) {
  const src = groceryIconUrl(name);
  const [failedSrc, setFailedSrc] = useState<string>();
  if (!src || src === failedSrc) {
    return <ShoppingBasketOutlinedIcon className="grocery-product-icon" aria-hidden="true" />;
  }
  return <img className="grocery-product-icon" src={src} alt="" width={52} height={52}
    referrerPolicy="no-referrer" crossOrigin="anonymous" onError={() => setFailedSrc(src)} />;
}
