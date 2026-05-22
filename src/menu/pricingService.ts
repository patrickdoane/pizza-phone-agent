import Database from "better-sqlite3";
import { menuSeed } from "./menuSeed.js";
import { getMenu, validatePizzaConfig } from "./menuService.js";
import { OrderDraft, pricedOrderSchema } from "../orders/orderSchema.js";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function priceOrder(db: Database.Database, orderDraft: OrderDraft) {
  const menu = getMenu(db) as typeof menuSeed;
  const lines: { description: string; quantity: number; lineTotal: number }[] = [];
  let subtotal = 0;

  for (const item of orderDraft.items) {
    if (item.type === "pizza") {
      const validation = validatePizzaConfig(db, item.size, item.crust, item.toppings);
      if (!validation.valid) {
        throw new Error(validation.errors.join("; "));
      }
      const size = menu.pizza.sizes.find((s) => s.name === item.size);
      const crust = menu.pizza.crusts.find((c) => c.name === item.crust);
      if (!size || !crust) {
        throw new Error("Invalid pizza configuration");
      }
      const toppingsTotal = item.toppings.reduce((sum, toppingName) => {
        const topping = menu.pizza.toppings.find((t) => t.name === toppingName);
        if (!topping) {
          throw new Error(`Invalid topping: ${toppingName}`);
        }
        return sum + topping.price;
      }, 0);
      const each = size.basePrice + crust.priceDelta + toppingsTotal;
      const lineTotal = roundMoney(each * item.quantity);
      subtotal += lineTotal;
      lines.push({ description: `${item.size} ${item.crust} pizza`, quantity: item.quantity, lineTotal });
      continue;
    }

    if (item.type === "wings") {
      const wings = menu.wings.find((w) => w.id === item.id);
      if (!wings) {
        throw new Error(`Invalid wings item id: ${item.id}`);
      }
      const lineTotal = roundMoney(wings.price * item.quantity);
      subtotal += lineTotal;
      lines.push({ description: wings.name, quantity: item.quantity, lineTotal });
      continue;
    }

    const drink = menu.drinks.find((d) => d.id === item.id);
    if (!drink) {
      throw new Error(`Invalid drink item id: ${item.id}`);
    }
    const lineTotal = roundMoney(drink.price * item.quantity);
    subtotal += lineTotal;
    lines.push({ description: drink.name, quantity: item.quantity, lineTotal });
  }

  subtotal = roundMoney(subtotal);
  let discount = 0;
  let appliedCoupon: string | null = null;

  if (orderDraft.couponCode) {
    const coupon = menu.coupons.find((c) => c.code.toUpperCase() === orderDraft.couponCode?.toUpperCase());
    if (!coupon) {
      throw new Error(`Invalid coupon: ${orderDraft.couponCode}`);
    }
    if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
      throw new Error(`Coupon ${coupon.code} requires minimum subtotal of ${coupon.minSubtotal}`);
    }
    if (coupon.type === "percent") {
      discount = roundMoney((subtotal * coupon.value) / 100);
    } else {
      discount = roundMoney(coupon.value);
    }
    discount = Math.min(discount, subtotal);
    appliedCoupon = coupon.code;
  }

  const taxable = roundMoney(subtotal - discount);
  const tax = roundMoney(taxable * menu.taxRate);
  const total = roundMoney(taxable + tax);

  return pricedOrderSchema.parse({ subtotal, discount, tax, total, appliedCoupon, lines });
}
