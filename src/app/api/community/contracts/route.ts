import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { communityDMs, communityProfiles, user, escrowTransactions } from "@/db/schema";
import { and, desc, eq, like, or, inArray } from "drizzle-orm";
import { buildAuthHeaders } from "@/lib/auth-headers";

function parseContractOfferMessage(rawMessage: string) {
  if (typeof rawMessage !== "string") return null;

  if (rawMessage.startsWith("[CONTRACT_OFFER_JSON]")) {
    try {
      const parsed = JSON.parse(rawMessage.replace("[CONTRACT_OFFER_JSON]", ""));
      if (parsed?.type === "contract_offer" && parsed?.contractId) {
        return {
          contractId: String(parsed.contractId),
          title: String(parsed.title || "Contract Offer"),
          amount: parsed.amount != null ? String(parsed.amount) : "",
          timeline: String(parsed.timeline || ""),
          milestones: String(parsed.milestones || ""),
          description: String(parsed.description || ""),
          revisions: parsed.revisions != null ? Number(parsed.revisions) : 0,
          createdAt: String(parsed.createdAt || ""),
        };
      }
    } catch {}
  }

  if (!rawMessage.startsWith("[CONTRACT OFFER]")) return null;

  const lines = rawMessage.split("\n");
  const title = lines.find((line) => line.startsWith("Title: "))?.replace("Title: ", "") || "Contract Offer";
  const amount = lines.find((line) => line.startsWith("Amount: "))?.replace("Amount: ", "").replace("$", "") || "";
  const timeline = lines.find((line) => line.startsWith("Timeline: "))?.replace("Timeline: ", "") || "";
  const milestones = lines.find((line) => line.startsWith("Milestones: "))?.replace("Milestones: ", "") || "";
  const descriptionIndex = lines.findIndex((line) => line.trim() === "Description:");
  const description = descriptionIndex >= 0 ? lines.slice(descriptionIndex + 1).join("\n").trim() : "";
  const fallbackKey = rawMessage.replace(/\s+/g, " ").trim().slice(0, 120);

  return {
    contractId: `legacy_${fallbackKey}`,
    title,
    amount,
    timeline,
    milestones,
    description,
    createdAt: "",
  };
}

function parseContractEventMessage(rawMessage: string) {
  if (typeof rawMessage !== "string") return null;

  const prefixes = ["[CONTRACT_RESPONSE]", "[CONTRACT_CANCEL]"] as const;
  const matchedPrefix = prefixes.find((prefix) => rawMessage.startsWith(prefix));
  if (!matchedPrefix) return null;

  try {
    const parsed = JSON.parse(rawMessage.replace(matchedPrefix, ""));
    if (!parsed?.contractId) return null;

    const action =
      parsed.action === "accepted"
        ? "accepted"
        : parsed.action === "declined"
          ? "declined"
          : parsed.action === "escrow_funded"
            ? "escrow_funded"
            : parsed.action === "released"
              ? "released"
              : "cancelled";

    return {
      contractId: String(parsed.contractId),
      action,
      actedAt: String(parsed.actedAt || ""),
      actorName: String(parsed.actorName || ""),
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(communityDMs)
    .where(
      and(
        or(eq(communityDMs.senderId, session.user.id), eq(communityDMs.receiverId, session.user.id)),
        or(
          like(communityDMs.message, "[CONTRACT OFFER]%"),
          like(communityDMs.message, "[CONTRACT_OFFER_JSON]%"),
          like(communityDMs.message, "[CONTRACT_RESPONSE]%"),
          like(communityDMs.message, "[CONTRACT_CANCEL]%")
        )
      )
    )
    .orderBy(desc(communityDMs.createdAt));

  const contractMap = new Map<string, any>();

  for (const msg of [...rows].reverse()) {
    const offer = parseContractOfferMessage(msg.message);
    if (offer) {
      const partnerId = msg.senderId === session.user.id ? msg.receiverId : msg.senderId;
      const current = contractMap.get(offer.contractId);
      contractMap.set(offer.contractId, {
        id: msg.id,
        contractId: offer.contractId,
        conversationKey: msg.conversationKey,
        messageId: msg.id,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        projectId: msg.projectId,
        proposalId: msg.proposalId,
        createdAt: msg.createdAt,
        updatedAt: msg.createdAt,
        title: offer.title,
        amount: offer.amount,
        timeline: offer.timeline,
        milestones: offer.milestones,
        description: offer.description,
        status: current?.status || "pending",
        statusActorName: current?.statusActorName || null,
        statusUpdatedAt: current?.statusUpdatedAt || null,
        partnerId,
      });
      continue;
    }

    const event = parseContractEventMessage(msg.message);
    if (!event) continue;

    const current = contractMap.get(event.contractId);
    if (!current) continue;

    contractMap.set(event.contractId, {
      ...current,
      status: event.action,
      statusActorName: event.actorName || null,
      statusUpdatedAt: event.actedAt || msg.createdAt,
      updatedAt: event.actedAt || msg.createdAt,
    });
  }

  const contractIds = Array.from(contractMap.keys());
  let escrowMap = new Map<string, any>();
  if (contractIds.length > 0) {
    const escrowRows = await db.select()
      .from(escrowTransactions)
      .where(inArray(escrowTransactions.contractId, contractIds));
    for (const row of escrowRows) {
      escrowMap.set(row.contractId, row);
    }
  }

  const items = await Promise.all(
    Array.from(contractMap.values()).map(async (contract) => {
      const [profile] = await db.select().from(communityProfiles).where(eq(communityProfiles.userId, contract.partnerId));
      const [u] = await db.select().from(user).where(eq(user.id, contract.partnerId));
      const escrow = escrowMap.get(contract.contractId);
      const escrowStatus = escrow?.status || null;
      // Release/settlement should stop "Release Money" from rendering.
      // Workflow: only show ongoing when escrow is escrow_funded (work in progress), not released/completed.
      const isEscrowOngoing = escrowStatus === "escrow_funded" || escrowStatus === "funded";
      const isOngoing = Boolean(isEscrowOngoing) && contract.status !== "cancelled" && contract.status !== "declined";

      return {
        ...contract,
        isSender: contract.senderId === session.user.id,
        isReceiver: contract.receiverId === session.user.id,
        isOngoing,
        escrowStatus: escrow?.status || null,
        escrowFundedAt: escrow?.fundedAt || null,
        partnerName: profile?.displayName || u?.name || "Unknown",
        partnerImage: u?.image || null,
        partnerType: profile?.userType || "unknown",
      };
    })
  );

  const visibleItems = items.filter((c) => c.status !== "cancelled" && c.status !== "declined");

  console.log("[contracts/GET] returning", visibleItems.length, "contracts. Sample escrow statuses:", visibleItems.slice(0, 3).map((c) => ({ id: c.contractId, escrowStatus: c.escrowStatus, isOngoing: c.isOngoing })));

  return NextResponse.json(
    { contracts: visibleItems.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()) },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    }
  );
}
