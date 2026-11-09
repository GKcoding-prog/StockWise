-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'BUSINESS', 'PRO');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING_BALANCE', 'PURCHASE_RECEIPT', 'SUPPLIER_RETURN', 'SALE', 'SALE_VOID', 'CUSTOMER_RETURN', 'ADJUSTMENT', 'WRITE_OFF', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK', 'UNUSUAL_ADJUSTMENT', 'PURCHASE_OVERDUE', 'EXPIRY_APPROACHING', 'RECONCILIATION_MISMATCH');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('SALE', 'PURCHASE', 'ADJUSTMENT', 'WRITE_OFF', 'STOCK_COUNT', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(30),
    "locale" VARCHAR(5),
    "lastBusinessId" UUID,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "familyId" UUID NOT NULL,
    "businessId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedById" UUID,
    "userAgent" VARCHAR(300),
    "ip" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "legalName" VARCHAR(160),
    "nif" VARCHAR(40),
    "address" VARCHAR(250),
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "currency" CHAR(3) NOT NULL DEFAULT 'BIF',
    "locale" VARCHAR(5) NOT NULL DEFAULT 'fr',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Bujumbura',
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_memberships" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedById" UUID,
    "lastActiveAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "roleId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "invitedById" UUID NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "businessId" UUID,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" VARCHAR(60) NOT NULL,
    "group" VARCHAR(40) NOT NULL,
    "description" VARCHAR(200) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionKey" VARCHAR(60) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "address" VARCHAR(250),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "parentId" UUID,
    "description" VARCHAR(250),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "contactName" VARCHAR(100),
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "address" VARCHAR(250),
    "nif" VARCHAR(40),
    "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "notes" VARCHAR(1000),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "sku" VARCHAR(40) NOT NULL,
    "barcode" VARCHAR(64),
    "description" VARCHAR(1000),
    "categoryId" UUID,
    "defaultSupplierId" UUID,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'pcs',
    "allowFractional" BOOLEAN NOT NULL DEFAULT false,
    "sellingPrice" DECIMAL(18,2) NOT NULL,
    "costPrice" DECIMAL(18,4),
    "minStockLevel" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "targetStockLevel" DECIMAL(14,3),
    "reorderMultiple" DECIMAL(14,3),
    "leadTimeDaysOverride" INTEGER,
    "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" VARCHAR(300),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantityOnHand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "lastMovementAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantityChange" DECIMAL(14,3) NOT NULL,
    "quantityBefore" DECIMAL(14,3) NOT NULL,
    "quantityAfter" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "averageCostAfter" DECIMAL(18,4) NOT NULL,
    "userId" UUID NOT NULL,
    "reason" VARCHAR(60),
    "note" VARCHAR(500),
    "documentRef" VARCHAR(40),
    "purchaseId" UUID,
    "purchaseItemId" UUID,
    "saleId" UUID,
    "saleItemId" UUID,
    "reversalOfId" UUID,
    "batchId" UUID,
    "transferId" UUID,
    "idempotencyKey" VARCHAR(80),
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_batches" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "batchNumber" VARCHAR(60),
    "expiryDate" DATE,
    "quantityReceived" DECIMAL(14,3) NOT NULL,
    "quantityRemaining" DECIMAL(14,3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "businessId" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("businessId","kind","year")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "supplierId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "orderedAt" TIMESTAMPTZ(3),
    "expectedAt" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" VARCHAR(500),
    "notes" VARCHAR(1000),
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantityOrdered" DECIMAL(14,3) NOT NULL,
    "quantityReceived" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "quantityReturned" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "warehouseId" UUID NOT NULL,
    "soldById" UUID NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "customerName" VARCHAR(120),
    "customerPhone" VARCHAR(30),
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "returnedTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountTendered" DECIMAL(18,2),
    "changeDue" DECIMAL(18,2),
    "notes" VARCHAR(500),
    "idempotencyKey" VARCHAR(80),
    "requestHash" CHAR(64),
    "soldAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" VARCHAR(160) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "quantityReturned" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" VARCHAR(200) NOT NULL,
    "productId" UUID,
    "warehouseId" UUID,
    "movementId" UUID,
    "purchaseId" UUID,
    "params" JSONB NOT NULL DEFAULT '{}',
    "firstDetectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMPTZ(3),
    "acknowledgedById" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" UUID,
    "note" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "alertId" UUID,
    "type" VARCHAR(60) NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "businessId" UUID,
    "userId" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entityType" VARCHAR(40),
    "entityId" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(300),
    "requestId" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_snapshots" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "totalQuantity" DECIMAL(18,3) NOT NULL,
    "totalValue" DECIMAL(18,2) NOT NULL,
    "productCount" INTEGER NOT NULL,
    "lowStockCount" INTEGER NOT NULL,
    "outOfStockCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "business_memberships_userId_idx" ON "business_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "business_memberships_businessId_userId_key" ON "business_memberships"("businessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_businessId_email_idx" ON "invitations"("businessId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_businessId_key_key" ON "roles"("businessId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_businessId_code_key" ON "warehouses"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_businessId_name_key" ON "categories"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_businessId_name_key" ON "suppliers"("businessId", "name");

-- CreateIndex
CREATE INDEX "products_businessId_categoryId_idx" ON "products"("businessId", "categoryId");

-- CreateIndex
CREATE INDEX "products_businessId_defaultSupplierId_idx" ON "products"("businessId", "defaultSupplierId");

-- CreateIndex
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "products_businessId_sku_key" ON "products"("businessId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_businessId_barcode_key" ON "products"("businessId", "barcode");

-- CreateIndex
CREATE INDEX "stock_levels_businessId_warehouseId_idx" ON "stock_levels"("businessId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_productId_warehouseId_key" ON "stock_levels"("productId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_seq_key" ON "stock_movements"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reversalOfId_key" ON "stock_movements"("reversalOfId");

-- CreateIndex
CREATE INDEX "stock_movements_businessId_productId_occurredAt_idx" ON "stock_movements"("businessId", "productId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_businessId_occurredAt_idx" ON "stock_movements"("businessId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_businessId_type_occurredAt_idx" ON "stock_movements"("businessId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_businessId_userId_occurredAt_idx" ON "stock_movements"("businessId", "userId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_businessId_idempotencyKey_idx" ON "stock_movements"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "stock_movements_saleId_idx" ON "stock_movements"("saleId");

-- CreateIndex
CREATE INDEX "stock_movements_purchaseId_idx" ON "stock_movements"("purchaseId");

-- CreateIndex
CREATE INDEX "product_batches_businessId_expiryDate_idx" ON "product_batches"("businessId", "expiryDate");

-- CreateIndex
CREATE INDEX "product_batches_productId_warehouseId_idx" ON "product_batches"("productId", "warehouseId");

-- CreateIndex
CREATE INDEX "purchases_businessId_status_idx" ON "purchases"("businessId", "status");

-- CreateIndex
CREATE INDEX "purchases_businessId_supplierId_idx" ON "purchases"("businessId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_businessId_reference_key" ON "purchases"("businessId", "reference");

-- CreateIndex
CREATE INDEX "purchase_items_purchaseId_idx" ON "purchase_items"("purchaseId");

-- CreateIndex
CREATE INDEX "purchase_items_businessId_productId_idx" ON "purchase_items"("businessId", "productId");

-- CreateIndex
CREATE INDEX "sales_businessId_soldAt_idx" ON "sales"("businessId", "soldAt");

-- CreateIndex
CREATE INDEX "sales_businessId_soldById_soldAt_idx" ON "sales"("businessId", "soldById", "soldAt");

-- CreateIndex
CREATE INDEX "sales_businessId_status_idx" ON "sales"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_businessId_reference_key" ON "sales"("businessId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "sales_businessId_idempotencyKey_key" ON "sales"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

-- CreateIndex
CREATE INDEX "sale_items_businessId_productId_idx" ON "sale_items"("businessId", "productId");

-- CreateIndex
CREATE INDEX "alerts_businessId_status_type_idx" ON "alerts"("businessId", "status", "type");

-- CreateIndex
CREATE INDEX "alerts_businessId_dedupeKey_idx" ON "alerts"("businessId", "dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_userId_businessId_readAt_idx" ON "notifications"("userId", "businessId", "readAt");

-- CreateIndex
CREATE INDEX "audit_logs_businessId_createdAt_idx" ON "audit_logs"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_businessId_entityType_entityId_idx" ON "audit_logs"("businessId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_businessId_userId_createdAt_idx" ON "audit_logs"("businessId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_snapshots_businessId_warehouseId_date_key" ON "inventory_snapshots"("businessId", "warehouseId", "date");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "product_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
