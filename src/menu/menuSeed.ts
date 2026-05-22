export type CouponSeed = {
  code: string;
  type: "percent" | "amount";
  value: number;
  minSubtotal?: number;
};

export const menuSeed = {
  taxRate: 0.0825,
  deliveryZipCodes: ["10001", "10002", "10003", "10009", "10010", "10011"],
  pizza: {
    sizes: [
      { name: "small", basePrice: 10.99 },
      { name: "medium", basePrice: 13.99 },
      { name: "large", basePrice: 16.99 }
    ],
    crusts: [
      { name: "thin", priceDelta: 0 },
      { name: "hand-tossed", priceDelta: 1.5 },
      { name: "gluten-free", priceDelta: 2.5 }
    ],
    toppings: [
      { name: "pepperoni", price: 1.5 },
      { name: "sausage", price: 1.5 },
      { name: "mushrooms", price: 1.25 },
      { name: "onions", price: 1.0 },
      { name: "olives", price: 1.0 },
      { name: "green peppers", price: 1.0 },
      { name: "extra cheese", price: 1.75 }
    ]
  },
  wings: [
    { id: "wings-6", name: "6pc Wings", price: 7.99 },
    { id: "wings-12", name: "12pc Wings", price: 13.99 }
  ],
  drinks: [
    { id: "drink-cola-20oz", name: "Cola 20oz", price: 2.49 },
    { id: "drink-lemon-lime-20oz", name: "Lemon-Lime 20oz", price: 2.49 },
    { id: "drink-water", name: "Bottled Water", price: 1.99 }
  ],
  coupons: [
    { code: "SAVE10", type: "percent", value: 10, minSubtotal: 15 },
    { code: "WINGS5", type: "amount", value: 5, minSubtotal: 20 }
  ] as CouponSeed[]
};
