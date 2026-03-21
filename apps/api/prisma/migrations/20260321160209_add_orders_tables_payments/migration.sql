-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT,
    "staffId" TEXT NOT NULL,
    "tableId" TEXT,
    "orderNumber" INTEGER NOT NULL,
    "orderType" TEXT NOT NULL DEFAULT 'TABLE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "covers" INTEGER,
    "tabName" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vatTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "serviceCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "menuItemName" TEXT NOT NULL,
    "course" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "vatType" TEXT NOT NULL DEFAULT 'EAT_IN',
    "vatRate" DECIMAL(5,2) NOT NULL,
    "vatAmount" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedBy" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_modifiers" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "modifierOptionId" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "priceAdjustment" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "deviceId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "tipAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "serviceCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "serviceChargeType" TEXT,
    "cardScheme" TEXT,
    "cardLastFour" TEXT,
    "terminalId" TEXT,
    "transactionRef" TEXT,
    "authorisationCode" TEXT,
    "isContactless" BOOLEAN,
    "isSoftpos" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "processedBy" TEXT NOT NULL,
    "authorisedBy" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "refundType" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "appliedBy" TEXT NOT NULL,
    "authorisedBy" TEXT,
    "discountType" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "amountSaved" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_plans" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_layouts" (
    "id" TEXT NOT NULL,
    "tablePlanId" TEXT NOT NULL,
    "tableNumber" TEXT NOT NULL,
    "covers" INTEGER NOT NULL,
    "shape" TEXT NOT NULL DEFAULT 'SQUARE',
    "posX" DECIMAL(8,2) NOT NULL,
    "posY" DECIMAL(8,2) NOT NULL,
    "width" DECIMAL(8,2) NOT NULL,
    "height" DECIMAL(8,2) NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inactivityAlertMins" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_notes" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "isPersistent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_notes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_layouts" ADD CONSTRAINT "table_layouts_tablePlanId_fkey" FOREIGN KEY ("tablePlanId") REFERENCES "table_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_notes" ADD CONSTRAINT "table_notes_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "table_layouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
