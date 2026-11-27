/* 队伍 / 势力注册表。
   每个棋种可有多个势力；每个势力指定落在红/黑或白/黑一方。
   国际象棋新增鲁卡军/卡奥斯军，与女神军/邪神军按固定对手配对。 */
(function () {
  const FACTIONS = {
    cchess: [
      {
        key: "red", side: "red", tag: "执红", first: true,
        avatar: "img/Cchess/face/rk.png", track: "dungeon_irias"
      },
      {
        key: "black", side: "black", tag: "执黑", first: false,
        avatar: "img/Cchess/face/bk.png", track: "fieldm"
      }
    ],
    chess: [
      {
        key: "white", side: "white", tag: "执白 · 女神军", first: true, army: "女神军",
        avatar: "img/chess/art/goddess/King.png", track: "dungeon_irias"
      },
      {
        key: "black", side: "black", tag: "执黑 · 邪神军", first: false, army: "邪神军",
        avatar: "img/chess/art/demon/King.png", track: "fieldm"
      },
      {
        key: "ruka", side: "white", tag: "执白 · 鲁卡军", first: true, army: "鲁卡军",
        avatar: "img/chess/art/ruka/King.png", track: "boss_chaosruka2"
      },
      {
        key: "chaos", side: "black", tag: "执黑 · 卡奥斯军", first: false, army: "卡奥斯军",
        avatar: "img/chess/art/chaos/King.png", track: "singun_kessen_g"
      }
    ]
  };

  function all(game) {
    return (FACTIONS[game] || []).slice();
  }
  function get(game, key) {
    return all(game).find(f => f.key === key) || null;
  }
  function count(game) {
    return all(game).length;
  }
  function sideOf(game, key) {
    const f = get(game, key);
    return f ? f.side : "";
  }
  function keyForSide(game, side) {
    const f = all(game).find(x => x.side === side);
    return f ? f.key : "";
  }

  YZ.factions = { FACTIONS, all, get, count, sideOf, keyForSide };
})(window);
