import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { shouldRunDbIntegrationTests } from "./test-db-availability";

const testCommunityProfilesIntegration = (await shouldRunDbIntegrationTests()) ? test : test.skip;

testCommunityProfilesIntegration("perfil comunitario respeita privacidade e agrega metricas dos packs", async () => {
  const { db } = await import("../db");
  const {
    CommunityCreatorNotFoundError,
    CommunityProfilesService,
  } = await import("../services/community-profiles.service");
  const {
    iconPackInstalls,
    iconPackRatings,
    officialIconLibrary,
    officialIconPacks,
    userPublicProfiles,
    users,
  } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const service = new CommunityProfilesService();
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const ownerPublicCode = `USR-IT${suffix.slice(-6)}`;
  const packId = `community_pack:it:${suffix}`;

  const [owner] = await db.insert(users).values({
    username: `creator_${suffix}`,
    password: "hash_fake",
    publicCode: ownerPublicCode,
    nomeCompleto: "Criador Integration",
    fullNameVisibility: "public",
  }).returning();
  const [viewer] = await db.insert(users).values({
    username: `viewer_${suffix}`,
    password: "hash_fake",
    publicCode: `USR-VIEW${suffix.slice(-4)}`,
  }).returning();

  await db.insert(userPublicProfiles).values({
    userId: owner.id,
    bio: "Crio packs financeiros.",
    profileVisibility: "community",
  });
  await db.insert(officialIconPacks).values({
    id: packId,
    publicCode: `${ownerPublicCode}-P001`,
    ownerUserId: owner.id,
    name: "Pack Integration",
    description: "Pack usado no teste de perfil.",
    category: "financas",
    coverImageUrl: "https://cdn.fincontrol.dev/test/cover.png",
    isActive: true,
  });
  await db.insert(officialIconLibrary).values([
    {
      iconKey: `community:${owner.id}:one:pack:${packId}`,
      name: "Icone Um",
      imageUrl: "https://cdn.fincontrol.dev/test/one.png",
      category: "financas",
      packId,
      isActive: true,
      createdBy: owner.id,
    },
    {
      iconKey: `community:${owner.id}:two:pack:${packId}`,
      name: "Icone Dois",
      imageUrl: "https://cdn.fincontrol.dev/test/two.png",
      category: "financas",
      packId,
      isActive: true,
      createdBy: owner.id,
    },
  ]);
  await db.insert(iconPackInstalls).values({
    userId: viewer.id,
    packId,
  });
  await db.insert(iconPackRatings).values([
    {
      userId: owner.id,
      packId,
      rating: 5,
    },
    {
      userId: viewer.id,
      packId,
      rating: 4,
    },
  ]);

  try {
    const publicProfile = await service.getCreatorProfile(viewer.id, ownerPublicCode);
    assert.equal(publicProfile.displayName, `@creator_${suffix}`);
    assert.equal(publicProfile.fullName, "Criador Integration");
    assert.equal(publicProfile.metrics.packsPublished, 1);
    assert.equal(publicProfile.metrics.iconsPublished, 2);
    assert.equal(publicProfile.metrics.installs, 1);
    assert.equal(publicProfile.metrics.ratingAverage, 4.5);
    assert.equal(publicProfile.metrics.ratingCount, 2);
    assert.equal(publicProfile.packs[0]?.coverImageUrl, "https://cdn.fincontrol.dev/test/cover.png");

    const privateProfile = await service.updateOwnProfile(owner.id, {
      bio: "  Perfil privado atualizado.  ",
      profileVisibility: "private",
    });
    assert.equal(privateProfile.bio, "Perfil privado atualizado.");
    assert.equal(privateProfile.profileVisibility, "private");

    await assert.rejects(
      () => service.getCreatorProfile(viewer.id, ownerPublicCode),
      (error) => error instanceof CommunityCreatorNotFoundError,
    );

    const ownPrivateProfile = await service.getCreatorProfile(owner.id, ownerPublicCode);
    assert.equal(ownPrivateProfile.isOwnProfile, true);
  } finally {
    await db.delete(officialIconLibrary).where(eq(officialIconLibrary.packId, packId));
    await db.delete(officialIconPacks).where(eq(officialIconPacks.id, packId));
    await db.delete(users).where(eq(users.id, owner.id));
    await db.delete(users).where(eq(users.id, viewer.id));
  }
});
