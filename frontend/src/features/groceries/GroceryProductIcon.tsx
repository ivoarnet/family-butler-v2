import { useState } from "react";
import ShoppingBasketOutlinedIcon from "@mui/icons-material/ShoppingBasketOutlined";
import type { GroceryItem } from "./types";

export const BRING_ICON_ORIGIN = "https://web.getbring.com";

type IconMetadata = Pick<GroceryItem, "iconId" | "imageUrl">;
const safeIconId = /^[a-z0-9][a-z0-9_-]{0,159}$/;
const safeImageUrl = /^https:\/\/web\.getbring\.com\/assets\/images\/items\/[a-z0-9][a-z0-9_-]{0,159}\.png$/;

function iconSources({ iconId, imageUrl }: IconMetadata) {
  // Validate the original string, before URL parsing can normalize traversal or escapes.
  const explicit = typeof imageUrl === "string" && imageUrl === imageUrl.trim() && safeImageUrl.test(imageUrl) ? imageUrl : undefined;
  const canonical = typeof iconId === "string" && iconId === iconId.trim() && safeIconId.test(iconId)
    ? `${BRING_ICON_ORIGIN}/assets/images/items/${iconId}.png` : undefined;
  return [...new Set([explicit, canonical].filter((src): src is string => Boolean(src)))];
}

export const groceryIconUrl = (metadata: IconMetadata) => iconSources(metadata)[0];

function ProductImage({ sources }: { sources: string[] }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex];
  if (!src) {
    return <ShoppingBasketOutlinedIcon className="grocery-product-icon" aria-hidden="true" />;
  }
  return <img className="grocery-product-icon" src={src} alt="" width={52} height={52}
    key={src} referrerPolicy="no-referrer" crossOrigin="anonymous"
    onError={() => setSourceIndex((index) => index + 1)} />;
}

export function GroceryProductIcon(metadata: IconMetadata) {
  return <ProductImage key={JSON.stringify([metadata.imageUrl, metadata.iconId])} sources={iconSources(metadata)} />;
}
