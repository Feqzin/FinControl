import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  iconPackInstalls,
  iconPackRatings,
  officialIconLibrary,
  officialIconPacks,
  userPublicProfiles,
  users,
} from "@shared/schema";
import type { UpdateCommunityProfileBodyInput } from "../validators/community-profiles.validators";

export class CommunityCreatorNotFoundError extends Error {}

export type CommunityProfileVisibility = "private" | "community";

export type CommunityCreatorPackView = {
  id: string;
  publicCode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  coverImageUrl: string | null;
  iconsCount: number;
  installCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CommunityCreatorProfileView = {
  publicCode: string;
  username: string | null;
  displayName: string;
  fullName: string | null;
  bio: string | null;
  profileVisibility: CommunityProfileVisibility;
  isOwnProfile: boolean;
  metrics: {
    packsPublished: number;
    iconsPublished: number;
    installs: number;
    ratingAverage: number | null;
    ratingCount: number;
  };
  packs: CommunityCreatorPackView[];
};

type CommunityProfileUserRow = {
  id: string;
  username: string | null;
  publicCode: string | null;
  fullName: string | null;
  fullNameVisibility: string | null;
  bio: string | null;
  profileVisibility: string | null;
};

function normalizeProfileVisibility(value: string | null | undefined): CommunityProfileVisibility {
  return value === "community" ? "community" : "private";
}

function normalizePublicUsername(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._-]{3,30}$/.test(normalized) ? normalized : null;
}

function buildDisplayName(user: CommunityProfileUserRow): string {
  const username = normalizePublicUsername(user.username);
  if (username) return `@${username}`;
  const suffix = user.publicCode?.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase() || "0000";
  return `Usuário USR-${suffix}`;
}

function normalizeRating(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export class CommunityProfilesService {
  private async findUserById(userId: string): Promise<CommunityProfileUserRow | null> {
    const [row] = await db
      .select({
        id: users.id,
        username: users.username,
        publicCode: users.publicCode,
        fullName: users.nomeCompleto,
        fullNameVisibility: users.fullNameVisibility,
        bio: userPublicProfiles.bio,
        profileVisibility: userPublicProfiles.profileVisibility,
      })
      .from(users)
      .leftJoin(userPublicProfiles, eq(userPublicProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    return row ?? null;
  }

  private async findUserByPublicCode(publicCode: string): Promise<CommunityProfileUserRow | null> {
    const [row] = await db
      .select({
        id: users.id,
        username: users.username,
        publicCode: users.publicCode,
        fullName: users.nomeCompleto,
        fullNameVisibility: users.fullNameVisibility,
        bio: userPublicProfiles.bio,
        profileVisibility: userPublicProfiles.profileVisibility,
      })
      .from(users)
      .leftJoin(userPublicProfiles, eq(userPublicProfiles.userId, users.id))
      .where(sql`lower(${users.publicCode}) = lower(${publicCode.trim()})`)
      .limit(1);

    return row ?? null;
  }

  private async buildProfile(
    requesterUserId: string,
    user: CommunityProfileUserRow,
  ): Promise<CommunityCreatorProfileView> {
    if (!user.publicCode) {
      throw new CommunityCreatorNotFoundError("Perfil de criador não disponível.");
    }

    const packRows = await db
      .select()
      .from(officialIconPacks)
      .where(and(
        eq(officialIconPacks.ownerUserId, user.id),
        eq(officialIconPacks.isActive, true),
      ))
      .orderBy(desc(officialIconPacks.createdAt), asc(officialIconPacks.name));

    const packIds = packRows.map((pack) => pack.id);
    const iconRows = packIds.length > 0
      ? await db
        .select({
          id: officialIconLibrary.id,
          packId: officialIconLibrary.packId,
          imageUrl: officialIconLibrary.imageUrl,
          createdAt: officialIconLibrary.createdAt,
        })
        .from(officialIconLibrary)
        .where(and(
          eq(officialIconLibrary.isActive, true),
          inArray(officialIconLibrary.packId, packIds),
        ))
        .orderBy(asc(officialIconLibrary.createdAt))
      : [];
    const installRows = packIds.length > 0
      ? await db
        .select({
          packId: iconPackInstalls.packId,
          count: sql<number>`count(*)`,
        })
        .from(iconPackInstalls)
        .where(inArray(iconPackInstalls.packId, packIds))
        .groupBy(iconPackInstalls.packId)
      : [];
    const ratingRows = packIds.length > 0
      ? await db
        .select({
          packId: iconPackRatings.packId,
          ratingAverage: sql<number>`round(avg(${iconPackRatings.rating})::numeric, 1)`,
          ratingCount: sql<number>`count(*)`,
        })
        .from(iconPackRatings)
        .where(inArray(iconPackRatings.packId, packIds))
        .groupBy(iconPackRatings.packId)
      : [];

    const iconsByPackId = new Map<string, typeof iconRows>();
    for (const icon of iconRows) {
      if (!icon.packId) continue;
      const current = iconsByPackId.get(icon.packId) ?? [];
      current.push(icon);
      iconsByPackId.set(icon.packId, current);
    }
    const installsByPackId = new Map(
      installRows.map((row) => [row.packId, Number(row.count) || 0]),
    );
    const ratingsByPackId = new Map(
      ratingRows.map((row) => [
        row.packId,
        {
          average: normalizeRating(row.ratingAverage),
          count: Number(row.ratingCount) || 0,
        },
      ]),
    );

    const packs = packRows.map((pack) => {
      const packIcons = iconsByPackId.get(pack.id) ?? [];
      const rating = ratingsByPackId.get(pack.id) ?? { average: null, count: 0 };
      return {
        id: pack.id,
        publicCode: pack.publicCode ?? null,
        name: pack.name,
        description: pack.description ?? null,
        category: pack.category ?? null,
        coverImageUrl: pack.coverImageUrl ?? packIcons[0]?.imageUrl ?? null,
        iconsCount: packIcons.length,
        installCount: installsByPackId.get(pack.id) ?? 0,
        ratingAverage: rating.average,
        ratingCount: rating.count,
        createdAt: pack.createdAt,
        updatedAt: pack.updatedAt,
      };
    });

    const ratingCount = packs.reduce((total, pack) => total + pack.ratingCount, 0);
    const weightedRatingTotal = packs.reduce(
      (total, pack) => total + ((pack.ratingAverage ?? 0) * pack.ratingCount),
      0,
    );

    return {
      publicCode: user.publicCode,
      username: normalizePublicUsername(user.username),
      displayName: buildDisplayName(user),
      fullName: user.fullNameVisibility === "public" ? user.fullName : null,
      bio: user.bio,
      profileVisibility: normalizeProfileVisibility(user.profileVisibility),
      isOwnProfile: requesterUserId === user.id,
      metrics: {
        packsPublished: packs.length,
        iconsPublished: packs.reduce((total, pack) => total + pack.iconsCount, 0),
        installs: packs.reduce((total, pack) => total + pack.installCount, 0),
        ratingAverage: ratingCount > 0
          ? Math.round((weightedRatingTotal / ratingCount) * 10) / 10
          : null,
        ratingCount,
      },
      packs,
    };
  }

  async getOwnProfile(userId: string): Promise<CommunityCreatorProfileView> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new CommunityCreatorNotFoundError("Perfil de criador não encontrado.");
    }
    return this.buildProfile(userId, user);
  }

  async getCreatorProfile(
    requesterUserId: string,
    publicCode: string,
  ): Promise<CommunityCreatorProfileView> {
    const user = await this.findUserByPublicCode(publicCode);
    if (!user) {
      throw new CommunityCreatorNotFoundError("Perfil de criador não encontrado.");
    }
    const isOwnProfile = requesterUserId === user.id;
    if (!isOwnProfile && normalizeProfileVisibility(user.profileVisibility) !== "community") {
      throw new CommunityCreatorNotFoundError("Este perfil de criador é privado.");
    }
    return this.buildProfile(requesterUserId, user);
  }

  async updateOwnProfile(
    userId: string,
    payload: UpdateCommunityProfileBodyInput,
  ): Promise<CommunityCreatorProfileView> {
    const current = await this.findUserById(userId);
    if (!current) {
      throw new CommunityCreatorNotFoundError("Perfil de criador não encontrado.");
    }

    const bio = payload.bio === undefined
      ? current.bio
      : payload.bio?.trim() || null;
    const profileVisibility = payload.profileVisibility
      ?? normalizeProfileVisibility(current.profileVisibility);

    await db
      .insert(userPublicProfiles)
      .values({
        userId,
        bio,
        profileVisibility,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPublicProfiles.userId,
        set: {
          bio,
          profileVisibility,
          updatedAt: new Date(),
        },
      });

    const updated = await this.findUserById(userId);
    if (!updated) {
      throw new CommunityCreatorNotFoundError("Perfil de criador não encontrado.");
    }
    return this.buildProfile(userId, updated);
  }
}
