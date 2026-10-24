// Bot "Tela": pede uma sala ao servidor do PartilharTela e posta o link no Discord.
// O vídeo nunca passa pelo Discord; o bot só troca mensagens de texto.
import "dotenv/config";
import {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  TOKEN_SERVER_URL = "https://partilhartela.onrender.com", // API que cria as salas
  WEB_APP_URL = "https://partilhartela-1.onrender.com",     // site onde a pessoa entra
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Defina DISCORD_TOKEN, CLIENT_ID e GUILD_ID.");
  process.exit(1);
}

// 1) Comando /tela, registrado só no servidor de vocês (aparece na hora)
const commands = [
  new SlashCommandBuilder()
    .setName("tela")
    .setDescription("Cria uma sala do PartilharTela")
    .addStringOption((o) =>
      o.setName("titulo").setDescription("O que você vai mostrar").setMaxLength(100)
    ),
].map((c) => c.toJSON());

await new REST().setToken(DISCORD_TOKEN)
  .put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

// 2) Mesma chamada que o botão "Compartilhar tela" do site faz.
//    Timeout de 60s porque o Render gratuito pode estar hibernando.
async function criarSala(apelido) {
  const res = await fetch(`${TOKEN_SERVER_URL}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: apelido }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.code) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data.code; // o token e a hostKey que vêm junto são descartados
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand() || i.commandName !== "tela") return;

  // O Discord só espera 3s. deferReply() mostra "pensando…" e dá até 15 min.
  await i.deferReply();

  try {
    const code = await criarSala(i.member?.displayName ?? i.user.username);
    const url = `${WEB_APP_URL}/?room=${code}`;
    const titulo = i.options.getString("titulo") ?? "Compartilhamento de tela";
    const canalVoz = i.member?.voice?.channel;

    const embed = new EmbedBuilder()
      .setTitle(`🖥️ ${titulo}`)
      .setDescription(
        `${i.user} abriu a sala **${code}**` +
        (canalVoz ? ` para quem está em **${canalVoz.name}**.` : ".")
      )
      .setFooter({ text: "A sala expira em 12h" })
      .setTimestamp();

    const botao = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Entrar na sala").setStyle(ButtonStyle.Link).setURL(url)
    );

    await i.editReply({ embeds: [embed], components: [botao] });
  } catch (err) {
    console.error("[tela-bot] Falha ao criar sala:", err);
    await i.editReply("❌ Não consegui criar a sala. O servidor pode estar acordando; tente de novo em alguns segundos.");
  }
});

client.once("ready", (c) => console.log(`[tela-bot] Online como ${c.user.tag}`));
client.login(DISCORD_TOKEN);
