/**
 * Credits Service - Credit management system
 * Adapted from _ref/src/utils/credits.ts
 */

import { eq, sql, desc, and, lt, isNull, gt, or, asc } from "drizzle-orm";
import { getDB } from "@/db";
import { userTable, creditTransactionTable, CREDIT_TRANSACTION_TYPE, purchasedItemsTable } from "@/db/schema";
import {
  updateAllSessionsOfUser,
  updateKVSession,
  type KVSession,
  type AuthEnv
} from "./auth-service";
import { CREDIT_PACKAGES, FREE_MONTHLY_CREDITS, DISABLE_CREDIT_BILLING_SYSTEM } from "@/shared/constants";

// ============================================================================
// Types
// ============================================================================

export type CreditEnv = AuthEnv;

type CreditPackage = typeof CREDIT_PACKAGES[number];

// ============================================================================
// Helper Functions
// ============================================================================

export function getCreditPackage(packageId: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((pkg) => pkg.id === packageId);
}

function shouldRefreshCredits(session: KVSession, currentTime: Date): boolean {
  if (!session.user.lastCreditRefreshAt) {
    return true;
  }

  const lastRefresh = new Date(session.user.lastCreditRefreshAt);
  const year = lastRefresh.getFullYear();
  const month = lastRefresh.getMonth();
  const day = lastRefresh.getDate();

  let oneMonthAfterLastRefresh = new Date(year, month + 1, day);

  if (oneMonthAfterLastRefresh.getDate() !== day) {
    oneMonthAfterLastRefresh = new Date(year, month + 2, 0);
  }

  oneMonthAfterLastRefresh.setHours(lastRefresh.getHours(), lastRefresh.getMinutes(), lastRefresh.getSeconds(), lastRefresh.getMilliseconds());

  return currentTime >= oneMonthAfterLastRefresh;
}

async function processExpiredCredits(env: CreditEnv, userId: string, currentTime: Date) {
  if (DISABLE_CREDIT_BILLING_SYSTEM) {
    return;
  }

  const db = getDB(env.DB);

  const expiredTransactions = await db.query.creditTransactionTable.findMany({
    where: and(
      eq(creditTransactionTable.userId, userId),
      lt(creditTransactionTable.expirationDate, currentTime),
      isNull(creditTransactionTable.expirationDateProcessedAt),
      gt(creditTransactionTable.remainingAmount, 0),
    ),
    orderBy: [
      desc(sql`CASE WHEN ${creditTransactionTable.type} = ${CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH} THEN 1 ELSE 0 END`),
      asc(creditTransactionTable.createdAt),
    ],
  });

  for (const transaction of expiredTransactions) {
    try {
      const updateResult = await db
        .update(creditTransactionTable)
        .set({
          expirationDateProcessedAt: currentTime,
          remainingAmount: 0,
        })
        .where(and(
          eq(creditTransactionTable.id, transaction.id),
          isNull(creditTransactionTable.expirationDateProcessedAt),
          eq(creditTransactionTable.remainingAmount, transaction.remainingAmount)
        ))
        .returning({ id: creditTransactionTable.id });

      if (!updateResult || updateResult.length === 0) {
        continue;
      }

      await db
        .update(userTable)
        .set({
          currentCredits: sql`${userTable.currentCredits} - ${transaction.remainingAmount}`,
        })
        .where(eq(userTable.id, userId));
    } catch (error) {
      console.error(`Failed to process expired credits for transaction ${transaction.id}:`, error);
      continue;
    }
  }
}

// ============================================================================
// Credit Management Functions
// ============================================================================

export async function addUserCredits(env: CreditEnv, userId: string, creditsToAdd: number) {
  if (DISABLE_CREDIT_BILLING_SYSTEM) {
    return;
  }

  const db = getDB(env.DB);
  await db
    .update(userTable)
    .set({
      currentCredits: sql`${userTable.currentCredits} + ${creditsToAdd}`,
    })
    .where(eq(userTable.id, userId));
}

export async function logTransaction(
  env: CreditEnv,
  {
    userId,
    amount,
    description,
    type,
    expirationDate,
    paymentIntentId
  }: {
    userId: string;
    amount: number;
    description: string;
    type: keyof typeof CREDIT_TRANSACTION_TYPE;
    expirationDate?: Date;
    paymentIntentId?: string;
  }
) {
  if (DISABLE_CREDIT_BILLING_SYSTEM) {
    return;
  }

  const db = getDB(env.DB);
  await db.insert(creditTransactionTable).values({
    userId,
    amount,
    remainingAmount: amount,
    type,
    description,
    expirationDate,
    paymentIntentId
  });
}

export async function addFreeMonthlyCreditsIfNeeded(env: CreditEnv, session: KVSession): Promise<number> {
  if (DISABLE_CREDIT_BILLING_SYSTEM) {
    return 0;
  }

  const currentTime = new Date();

  if (shouldRefreshCredits(session, currentTime)) {
    const db = getDB(env.DB);
    const user = await db.query.userTable.findFirst({
      where: eq(userTable.id, session.userId),
      columns: {
        lastCreditRefreshAt: true,
        currentCredits: true,
      },
    });

    const dbLastRefreshAt = user?.lastCreditRefreshAt
      ? new Date(user.lastCreditRefreshAt)
      : null;

    if (!shouldRefreshCredits({ ...session, user: { ...session.user, lastCreditRefreshAt: dbLastRefreshAt } }, currentTime)) {
      await updateKVSession(env, session.id, session.userId, new Date(session.expiresAt));
      return user?.currentCredits ?? 0;
    }

    const year = currentTime.getFullYear();
    const month = currentTime.getMonth();
    const day = currentTime.getDate();

    let oneMonthAgo = new Date(year, month - 1, day);

    if (oneMonthAgo.getDate() !== day) {
      oneMonthAgo = new Date(year, month, 0);
    }

    oneMonthAgo.setHours(currentTime.getHours(), currentTime.getMinutes(), currentTime.getSeconds(), currentTime.getMilliseconds());

    const updateResult = await db
      .update(userTable)
      .set({
        lastCreditRefreshAt: currentTime,
      })
      .where(and(
        eq(userTable.id, session.userId),
        or(
          isNull(userTable.lastCreditRefreshAt),
          lt(userTable.lastCreditRefreshAt, oneMonthAgo)
        )
      ))
      .returning({ lastCreditRefreshAt: userTable.lastCreditRefreshAt });

    if (!updateResult || updateResult.length === 0) {
      const currentUser = await db.query.userTable.findFirst({
        where: eq(userTable.id, session.userId),
        columns: {
          currentCredits: true,
        },
      });
      return currentUser?.currentCredits ?? 0;
    }

    await processExpiredCredits(env, session.userId, currentTime);

    const expirationDate = new Date(currentTime);
    expirationDate.setMonth(expirationDate.getMonth() + 1);

    await addUserCredits(env, session.userId, FREE_MONTHLY_CREDITS);
    await logTransaction(env, {
      userId: session.userId,
      amount: FREE_MONTHLY_CREDITS,
      description: 'Free monthly credits',
      type: CREDIT_TRANSACTION_TYPE.MONTHLY_REFRESH,
      expirationDate
    });

    await updateAllSessionsOfUser(env, session.userId);

    const updatedUser = await db.query.userTable.findFirst({
      where: eq(userTable.id, session.userId),
      columns: {
        currentCredits: true,
      },
    });

    return updatedUser?.currentCredits ?? 0;
  }

  return session.user.currentCredits;
}

export async function hasEnoughCredits(
  env: CreditEnv,
  { userId, requiredCredits }: { userId: string; requiredCredits: number }
) {
  if (DISABLE_CREDIT_BILLING_SYSTEM) {
    return true;
  }

  const db = getDB(env.DB);
  const user = await db.query.userTable.findFirst({
    where: eq(userTable.id, userId),
    columns: {
      currentCredits: true,
    }
  });
  if (!user) return false;

  return user.currentCredits >= requiredCredits;
}

export async function consumeCredits(
  env: CreditEnv,
  { userId, amount, description }: { userId: string; amount: number; description: string }
) {
  if (DISABLE_CREDIT_BILLING_SYSTEM) {
    return 0;
  }

  const db = getDB(env.DB);

  const user = await db.query.userTable.findFirst({
    where: eq(userTable.id, userId),
    columns: {
      currentCredits: true,
    },
  });

  if (!user || user.currentCredits < amount) {
    throw new Error("Insufficient credits");
  }

  const activeTransactionsWithBalance = await db.query.creditTransactionTable.findMany({
    where: and(
      eq(creditTransactionTable.userId, userId),
      gt(creditTransactionTable.remainingAmount, 0),
      isNull(creditTransactionTable.expirationDateProcessedAt),
      or(
        isNull(creditTransactionTable.expirationDate),
        gt(creditTransactionTable.expirationDate, new Date())
      )
    ),
    orderBy: [asc(creditTransactionTable.createdAt)],
  });

  let remainingToDeduct = amount;
  let actuallyDeducted = 0;

  for (const transaction of activeTransactionsWithBalance) {
    if (remainingToDeduct <= 0) break;

    const deductFromThis = Math.min(transaction.remainingAmount, remainingToDeduct);
    const newRemainingAmount = transaction.remainingAmount - deductFromThis;

    const updateResult = await db
      .update(creditTransactionTable)
      .set({
        remainingAmount: newRemainingAmount,
      })
      .where(and(
        eq(creditTransactionTable.id, transaction.id),
        eq(creditTransactionTable.remainingAmount, transaction.remainingAmount)
      ))
      .returning({ remainingAmount: creditTransactionTable.remainingAmount });

    if (updateResult && updateResult.length > 0) {
      actuallyDeducted += deductFromThis;
      remainingToDeduct -= deductFromThis;
    }
  }

  if (actuallyDeducted < amount) {
    throw new Error("Insufficient credits - concurrent modification detected");
  }

  const userUpdateResult = await db
    .update(userTable)
    .set({
      currentCredits: sql`${userTable.currentCredits} - ${amount}`,
    })
    .where(and(
      eq(userTable.id, userId),
      sql`${userTable.currentCredits} >= ${amount}`
    ))
    .returning({ currentCredits: userTable.currentCredits });

  if (!userUpdateResult || userUpdateResult.length === 0) {
    throw new Error("Insufficient credits");
  }

  await db.insert(creditTransactionTable).values({
    userId,
    amount: -amount,
    remainingAmount: 0,
    type: CREDIT_TRANSACTION_TYPE.USAGE,
    description,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await updateAllSessionsOfUser(env, userId);

  return userUpdateResult[0].currentCredits;
}

export async function getCreditTransactions(
  env: CreditEnv,
  {
    userId,
    page = 1,
    limit = 10
  }: {
    userId: string;
    page?: number;
    limit?: number;
  }
) {
  if (DISABLE_CREDIT_BILLING_SYSTEM) {
    return {
      transactions: [],
      pagination: {
        total: 0,
        pages: 0,
        current: page,
      },
    };
  }

  const db = getDB(env.DB);
  const transactions = await db.query.creditTransactionTable.findMany({
    where: eq(creditTransactionTable.userId, userId),
    orderBy: [desc(creditTransactionTable.createdAt)],
    limit,
    offset: (page - 1) * limit,
    columns: {
      expirationDateProcessedAt: false,
      remainingAmount: false,
      userId: false,
    }
  });

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(creditTransactionTable)
    .where(eq(creditTransactionTable.userId, userId))
    .then((result) => result[0].count);

  return {
    transactions,
    pagination: {
      total,
      pages: Math.ceil(total / limit),
      current: page,
    },
  };
}

export async function getUserPurchasedItems(env: CreditEnv, userId: string) {
  const db = getDB(env.DB);
  const purchasedItems = await db.query.purchasedItemsTable.findMany({
    where: eq(purchasedItemsTable.userId, userId),
  });

  return new Set(
    purchasedItems.map(item => `${item.itemType}:${item.itemId}`)
  );
}
