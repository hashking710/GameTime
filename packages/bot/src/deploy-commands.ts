import { REST, Routes } from "discord.js";
import { loadEnv } from "@gametime/shared";
import { loadCommands } from "./commands/index";
import { z } from "zod";

const env = loadEnv(
  z.object({
    DISCORD_TOKEN: z.string(),
    DISCORD_CLIENT_ID: z.string(),
    DISCORD_GUILD_ID: z.string().optional(),
  }),
);

const commands = loadCommands();
const commandData = commands.map((c) => c.data.toJSON());

const rest = new REST().setToken(env.DISCORD_TOKEN);

async function deploy() {
  console.log(`Registering ${commandData.length} commands...`);

  if (env.DISCORD_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(
        env.DISCORD_CLIENT_ID,
        env.DISCORD_GUILD_ID,
      ),
      { body: commandData },
    );
    console.log(`Registered to guild ${env.DISCORD_GUILD_ID}`);
  } else {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
      body: commandData,
    });
    console.log("Registered globally");
  }
}

deploy().catch(console.error);
