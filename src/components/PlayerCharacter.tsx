import { useEffect, useRef, useState } from "react";
import { supabase } from "../data/supabase";
import {
  characterExpression,
  characterFor,
  type CharacterAsset,
  type CharacterMood,
} from "../domain/characters";
import type { Player } from "../domain/types";
import { Avatar } from "./ui";
import "./player-character.css";
const images = new Map<string, Promise<HTMLImageElement>>();
export function preloadCharacter(asset: CharacterAsset) {
  const src = asset.playerId + ":" + asset.file;
  let promise = images.get(src);
  if (!promise) {
    promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Character unavailable"));
      if (!supabase) {
        reject(new Error("Inicia sesión para ver los personajes"));
        return;
      }
      void supabase
        .from("character_assets")
        .select("data_url")
        .eq("player_id", asset.playerId)
        .single()
        .then((r) => {
          if (r.error || !r.data) {
            reject(new Error("Personaje no disponible"));
            return;
          }
          image.src = r.data.data_url;
        });
    });
    images.set(src, promise);
    void promise.catch(() => images.delete(src));
  }
  return promise;
}
export function PlayerCharacter({
  player,
  mood = "idle",
  animate = true,
}: {
  player: Player;
  mood?: CharacterMood;
  animate?: boolean;
}) {
  const asset = characterFor(player);
  return asset ? (
    <CharacterCanvas key={asset.file} {...{ asset, player, mood, animate }} />
  ) : (
    <span className="player-character fallback">
      <Avatar player={player} size="large" />
    </span>
  );
}
function CharacterCanvas({
  asset,
  player,
  mood,
  animate,
}: {
  asset: CharacterAsset;
  player: Player;
  mood: CharacterMood;
  animate: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const node = canvas.current,
      ctx = node?.getContext("2d");
    if (!node || !ctx) return;
    let disposed = false,
      raf = 0,
      previous = 0,
      elapsed = 0,
      lastDraw = -100,
      expression = -1,
      fromExpression = 0,
      expressionAt = 0,
      onScreen = true,
      image: HTMLImageElement | undefined;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting;
            previous = 0;
          })
        : null;
    observer?.observe(node);
    const draw = () => {
      if (!image) return;
      const frame = characterExpression(
          elapsed,
          mood,
          media.matches || !animate,
        ),
        cw = image.naturalWidth / 3,
        ch = image.naturalHeight / 2,
        s = cw / 512,
        head = asset.head,
        moves = animate && !media.matches;
      if (expression !== frame) {
        fromExpression = expression < 0 ? frame : expression;
        expression = frame;
        expressionAt = elapsed;
      }
      ctx.clearRect(0, 0, 272, 512);
      ctx.save();
      ctx.translate(
        136,
        260 + (moves ? Math.sin(elapsed / 260) * (mood === "goal" ? 5 : 2) : 0),
      );
      ctx.rotate(moves ? Math.sin(elapsed / 430) * 0.014 : 0);
      ctx.translate(-136, -260);
      ctx.drawImage(
        image,
        120 * s,
        (head - 2) * s,
        272 * s,
        (512 - head + 2) * s,
        0,
        head - 2,
        272,
        512 - head + 2,
      );
      ctx.save();
      ctx.translate(136, head);
      ctx.rotate(moves ? Math.sin(elapsed / 340) * 0.018 : 0);
      ctx.translate(-136, -head);
      const drawHead = (cell: number) =>
        ctx.drawImage(
          image!,
          (cell % 3) * cw + 120 * s,
          Math.floor(cell / 3) * ch,
          272 * s,
          (head + 4) * s,
          0,
          0,
          272,
          head + 4,
        );
      // Keep the silhouette opaque while expressions blend, including quick blinks.
      const blend = moves
        ? Math.min(1, (elapsed - expressionAt) / (frame === 1 ? 65 : 120))
        : 1;
      if (blend < 1 && fromExpression !== expression) {
        drawHead(fromExpression);
        ctx.globalAlpha = blend;
      }
      drawHead(expression);
      ctx.restore();
      ctx.restore();
    };
    const tick = (stamp: number) => {
      if (disposed) return;
      if (!document.hidden && onScreen && animate && !media.matches) {
        if (previous) elapsed += Math.min(stamp - previous, 80);
        if (stamp - lastDraw >= 1000 / 30) {
          draw();
          lastDraw = stamp;
        }
      }
      previous = document.hidden || !onScreen ? 0 : stamp;
      if (animate && !media.matches) raf = requestAnimationFrame(tick);
    };
    const motionChange = () => {
      cancelAnimationFrame(raf);
      previous = 0;
      draw();
      if (image && animate && !media.matches) raf = requestAnimationFrame(tick);
    };
    media.addEventListener("change", motionChange);
    void preloadCharacter(asset)
      .then((img) => {
        if (disposed) return;
        image = img;
        draw();
        setLoaded(true);
        if (animate && !media.matches) raf = requestAnimationFrame(tick);
      })
      .catch(() => {
        /* Keep profile fallback on network failure. */
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      media.removeEventListener("change", motionChange);
    };
  }, [asset, mood, animate]);
  return (
    <span className={`player-character ${loaded ? "ready" : "loading"}`}>
      {!loaded && (
        <span className="character-placeholder">
          <Avatar player={player} size="large" />
        </span>
      )}
      <canvas
        ref={canvas}
        width={272}
        height={512}
        role="img"
        aria-label={`Personaje de ${player.name}`}
        style={{ visibility: loaded ? "visible" : "hidden" }}
      />
    </span>
  );
}
