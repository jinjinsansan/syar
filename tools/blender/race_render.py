"""
★Blender でレース映像を作る（★第 1 歩: まず 1 枚）

【★なぜ Blender か】
  ★2026-09-05 のオーナー判断（`HANDOVER_P4_RACE_VISUAL_20260905.md` §0）。
  ★three.js で手書きしていた ★**影・AO・被写界深度・モーションブラー**が最初から入っています。
  ⚠️ ★サインイン不要・ヘッドレスで動くので、★**私が自分で撮って見て直せます**。

【★使う素材】
  ★購入リグ（$35）… `assets-spike/3d/race-horse-jockey-lod-source/`（★.gitignore 済み）
  ★テクスチャ    … `apps/web/public/rig-lab-assets/*.png`（★既に正しく書き出し済み）
  ★空（HDRI）    … `apps/web/public/rig-lab-assets/hdri/sky_2k.hdr`（★CC0・LICENSE.txt 参照）

【★実測して分かっている数（★引継ぎ書 §1）】
  ★素材の高さ 2.19 単位（馬＋騎手）／ ★接地中の蹄は 2.66 単位/秒で後ろへ流れる（等倍）

★実行:
  "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe" -b -P tools/blender/race_render.py
"""
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath or os.getcwd())))
if not os.path.isdir(os.path.join(ROOT, "assets-spike")):
    ROOT = os.getcwd()

FBX = os.path.join(ROOT, "assets-spike/3d/race-horse-jockey-lod-source/ANIM_allmodels_allanim_BlenderFriendly.fbx")
TEX = os.path.join(ROOT, "apps/web/public/rig-lab-assets")
HDRI = os.path.join(TEX, "hdri/sky_2k.hdr")
OUT = os.path.join(ROOT, "out/blender")

# ★馬＋騎手の実寸 [m]（★three.js 側の HORSE_HEIGHT_M と合わせる）
HORSE_HEIGHT_M = 2.5
# ★全力疾走の区間（★30fps のコマ番号・★棚卸しで確定）
SPEED_RUN = (216, 363)
# ★素材のコマ速度
CLIP_FPS = 30.0
# ★★滑らない地面の速さ [m/s]（★等倍のとき・★Blender 上で実測: tmp の probe）
#   ★接地中の蹄の中央値 … 後 2.156 / 2.640、前 2.559 / 2.315 → 中央値 2.437
STANCE_MPS = 2.437
# ★馬が進む向き（★実測: 接地中に蹄が +Y へ流れる → 体は −Y へ進む）
FORWARD = -1.0


def log(*a):
    print("★", *a, flush=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_world():
    """★空と環境光。⚠️ ★HDRI が無いと樹脂に見えます（★three.js で確認済み）"""
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDRI)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    bg.inputs["Strength"].default_value = 1.0
    log("空（HDRI）を読みました:", os.path.basename(HDRI))


def import_horse():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=FBX, automatic_bone_orientation=True)
    added = [o for o in bpy.data.objects if o not in before]
    log("読み込んだ物体", len(added))

    # ★LOD1・マスク・手綱は隠す（★three.js 側と同じ扱い）
    hidden = 0
    for o in added:
        n = o.name.lower()
        if "lod1" in n or "horse_mask" in n or "reins_" in n:
            o.hide_render = True
            o.hide_viewport = True
            hidden += 1
    log("隠した物体", hidden)

    root = next((o for o in added if o.type == "ARMATURE"), None) or added[0]
    while root.parent is not None:
        root = root.parent

    # ★実寸へ（★素材の高さを測ってから合わせる）
    bpy.context.view_layer.update()
    meshes = [o for o in added if o.type == "MESH" and not o.hide_render]
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for m in meshes:
        for c in m.bound_box:
            w = m.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    height = hi.z - lo.z
    scale = HORSE_HEIGHT_M / height if height > 0 else 1.0
    root.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    log(f"素材の高さ {height:.3f} → 倍率 {scale:.4f}（実寸 {HORSE_HEIGHT_M}m）")
    return root, added


def image(name):
    path = os.path.join(TEX, name)
    if not os.path.exists(path):
        log("⚠️ テクスチャがありません:", name)
        return None
    img = bpy.data.images.load(path, check_existing=True)
    return img


def build_material(mat, base, normal=None, rough=None, alpha_clip=False):
    """★材質を組み直す。⚠️ ★FBX が指す TGA は読めないので、★書き出し済みの PNG を使います"""
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Metallic"].default_value = 0.0

    img = image(base)
    if img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_clip:
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    if normal is not None:
        nimg = image(normal)
        if nimg is not None:
            nimg.colorspace_settings.name = "Non-Color"
            ntex = nt.nodes.new("ShaderNodeTexImage")
            ntex.image = nimg
            nmap = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
            nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if rough is not None:
        rimg = image(rough)
        if rimg is not None:
            rimg.colorspace_settings.name = "Non-Color"
            rtex = nt.nodes.new("ShaderNodeTexImage")
            rtex.image = rimg
            nt.links.new(rtex.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = 0.62

    if alpha_clip:
        mat.surface_render_method = "DITHERED"


def dress(objects, body="horse-body.png", silk="silks-01.png"):
    seen = set()
    for o in objects:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen:
                continue
            seen.add(mat.name)
            n = mat.name.lower()
            if "horse_body" in n:
                build_material(mat, body, "horse-body-nmap.png", "horse-body-rough.png")
            elif "horse_hair" in n:
                build_material(mat, "horse-hair.png", "horse-hair-nmap.png", alpha_clip=True)
            elif "saddle" in n:
                build_material(mat, "saddle.png", "saddle-nmap.png")
            elif "jockey" in n or "material #4" in n:
                build_material(mat, silk, "jockey-body-nmap.png", "jockey-body-rough.png")
    log("組み直した材質", len(seen), sorted(seen))


def build_ground():
    """★芝。⚠️ ★単色だと動きが読めないので、★細かいムラを入れます（★手続き模様・画像不要）"""
    bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = "turf"
    mat = bpy.data.materials.new("turf")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 420.0
    noise.inputs["Detail"].default_value = 2.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.105, 0.180, 0.062, 1.0)
    ramp.color_ramp.elements[1].color = (0.170, 0.265, 0.105, 1.0)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    ground.data.materials.append(mat)
    return ground


def build_track(length=400.0):
    """★ラチ（向こう側）と距離標。★これが流れることで速さが読めます"""
    rail = bpy.data.materials.new("rail")
    rail.use_nodes = True
    rb = rail.node_tree.nodes["Principled BSDF"]
    rb.inputs["Base Color"].default_value = (0.85, 0.84, 0.80, 1.0)
    rb.inputs["Roughness"].default_value = 0.55

    posts = []
    gap = 4.0
    n = int(length / gap)
    for i in range(n):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(-8.5, -i * gap + 40, 0.55))
        p = bpy.context.object
        p.scale = (0.05, 0.05, 0.55)
        p.data.materials.append(rail)
        posts.append(p)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-8.5, -length / 2 + 40, 1.0))
    bar = bpy.context.object
    bar.scale = (0.04, length / 2, 0.04)
    bar.data.materials.append(rail)
    # ★距離標
    for i in range(int(length / 20)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(-9.9, -i * 20 + 40, 1.1))
        m = bpy.context.object
        m.scale = (0.07, 0.07, 1.1)
        m.data.materials.append(rail)
    log("ラチの柱", len(posts))


def build_sun():
    bpy.ops.object.light_add(type="SUN", location=(6, -8, 10))
    sun = bpy.context.object
    sun.data.energy = 3.0
    sun.data.angle = math.radians(2.0)   # ★影を少し柔らかく
    sun.rotation_euler = (math.radians(52), 0, math.radians(38))
    return sun


def build_camera(distance=13.0):
    bpy.ops.object.camera_add(location=(distance, 0, 1.9))
    cam = bpy.context.object
    cam.data.lens = 70
    cam.data.dof.use_dof = True
    cam.data.dof.aperture_fstop = 3.2
    bpy.context.scene.camera = cam
    return cam


def aim(cam, target, distance=13.0, height=1.9, ahead=1.0):
    """★真横から追う（★指示書 §6-3「真横カメラに限定してよい」）"""
    cam.location = Vector((distance, target.y + ahead, height))
    look = Vector((0.0, target.y, 1.35))
    cam.rotation_euler = (look - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.dof.focus_distance = (look - cam.location).length


def render_still(frame, path, samples=32):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.eevee.taa_render_samples = samples
    scene.eevee.use_raytracing = True
    scene.view_settings.view_transform = "AgX"
    scene.frame_set(frame)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    log("書き出しました:", path)


def render_range(start, end, folder, samples=24):
    """★連番で書き出す（★`blender -b` はここが本業）"""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.eevee.taa_render_samples = samples
    scene.eevee.use_raytracing = True
    scene.view_settings.view_transform = "AgX"
    # ★モーションブラー（★Blender は本物が入っています）
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.42
    os.makedirs(folder, exist_ok=True)
    import time
    t0 = time.time()
    for i, f in enumerate(range(start, end + 1)):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(folder, "f%04d" % i)
        bpy.ops.render.render(write_still=True)
        if i == 0:
            log("1 コマ目 %.1f 秒" % (time.time() - t0))
    n = end - start + 1
    log("%d コマ / 合計 %.1f 秒 / 1 コマ %.2f 秒" % (n, time.time() - t0, (time.time() - t0) / n))


def argv():
    a = sys.argv
    return a[a.index("--") + 1:] if "--" in a else []


def arg(name, default):
    a = argv()
    return a[a.index("--" + name) + 1] if ("--" + name) in a else default


def render_run(root, cam, seconds=3.0, speed_mps=16.0, fps=30, folder="run", samples=24):
    """
    ★**走らせて連番に書き出す。**

    ★素材は ★**その場走り**なので、★馬を進めながら**同じ速さで脚を回します**:
    ★　再生倍率 = 走る速さ ÷ 2.437（★等倍の接地速度・Blender 上で実測）
    ★これで ★**蹄が滑りません**（★three.js 側と同じ考え方）。
    """
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.eevee.taa_render_samples = samples
    scene.eevee.use_raytracing = True
    scene.view_settings.view_transform = "AgX"
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.42
    scene.render.fps = fps

    rate = speed_mps / STANCE_MPS
    span = SPEED_RUN[1] - SPEED_RUN[0]
    total = int(seconds * fps)
    out = os.path.join(OUT, folder)
    os.makedirs(out, exist_ok=True)
    log("走る速さ %.1f m/s → 再生倍率 %.2f（%.2f 完歩/秒）" % (speed_mps, rate, rate * CLIP_FPS / span))

    import time
    t0 = time.time()
    for i in range(total):
        t = i / fps
        # ★脚（★素材のコマを実数で進める）
        f = SPEED_RUN[0] + (t * rate * CLIP_FPS) % span
        scene.frame_set(int(f), subframe=f - int(f))
        # ★体（★滑らないよう、同じ速さで前へ）
        root.location.y = FORWARD * speed_mps * t
        aim(cam, root.location)
        bpy.context.view_layer.update()
        scene.render.filepath = os.path.join(out, "f%04d" % i)
        bpy.ops.render.render(write_still=True)
        if i == 0:
            log("1 コマ目 %.1f 秒" % (time.time() - t0))
    log("%d コマ / %.1f 秒" % (total, time.time() - t0))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    clear_scene()
    setup_world()
    root, added = import_horse()
    dress(added)
    build_ground()
    build_track()
    build_sun()
    cam = build_camera()
    if "--sprites" in argv():
        bake_sprites(root)
        return
    seconds = float(arg("seconds", "0"))
    if seconds > 0:
        render_run(root, cam, seconds=seconds, speed_mps=float(arg("speed", "16")),
                   folder=arg("out", "run"), samples=int(arg("samples", "24")))
    else:
        aim(cam, root.location)
        mid = (SPEED_RUN[0] + SPEED_RUN[1]) // 2
        render_still(mid, os.path.join(OUT, "first_light.png"))




# ==========================================================================
# ★スプライトを焼く（★sevendays 方式・2026-09-05）
#
#   ★別プロジェクト `sevendays` が確立している納品形式に合わせます:
#     ★8 コマ × ★無彩色の層 × 512px 正方 × ★接地線を全コマで統一
#     → ★体の色は**エンジンが乗せる**（12 頭の色違いが 1 組の素材で作れる）
#
#   ★`HORSE_VISUAL_SYSTEM.md`（sevendays）:
#     「coat/mane は**必ずグレースケール**で。エンジンが色を乗算/着色して陰影を保つため。
#       フルカラーだと綺麗に塗り替えできない」
#
#   ⚠️ ★STAR で私が 3 回外した所（アルファが陰影か RGB が毛色か）は、
#      ★この規約を最初に決めておけば起きません。
# ==========================================================================

# ★1 完歩の区間（★Blender 上で実測: 蹄の接地開始 222 → 269）
STRIDE_FRAMES = (222, 269)
# ★スプライトの寸法（★sevendays と同じ 512 正方）
SPRITE_PX = 512
# ★接地点（★画像の上端から下へ何割。★sevendays の実測 0.920 に合わせる）
FEET_RATIO = 0.920
# ★正方に収める実寸 [m]
SPRITE_SPAN_M = 4.6
# ★焼くコマ数（★sevendays のオーナー決定「コマ数は 8」）
SPRITE_FRAMES = 8


def set_material_alpha(name_match, visible):
    """★材質ごとに見える/見えないを切り替える（★層に分けて焼くため）"""
    for mat in bpy.data.materials:
        if mat.node_tree is None:
            continue
        n = mat.name.lower()
        if not any(k in n for k in name_match):
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Alpha"].default_value = 1.0 if visible else 0.0
        mat.surface_render_method = "DITHERED"


def set_saturation(match, sat):
    """★無彩色にする（★彩度 0）。★色はエンジンが乗せます"""
    for mat in bpy.data.materials:
        n = mat.name.lower()
        if mat.node_tree is None or not any(k in n for k in match):
            continue
        nt = mat.node_tree
        bsdf = next((x for x in nt.nodes if x.type == "BSDF_PRINCIPLED"), None)
        tex = next((x for x in nt.nodes if x.type == "TEX_IMAGE" and x.image
                    and "nmap" not in x.image.name and "rough" not in x.image.name), None)
        if bsdf is None or tex is None:
            continue
        hsv = next((x for x in nt.nodes if x.type == "HUE_SAT"), None)
        if hsv is None:
            hsv = nt.nodes.new("ShaderNodeHueSaturation")
            nt.links.new(tex.outputs["Color"], hsv.inputs["Color"])
            nt.links.new(hsv.outputs["Color"], bsdf.inputs["Base Color"])
        hsv.inputs["Saturation"].default_value = sat


LAYERS = (
    # ★名前, 見せる材質, 無彩色にするか
    ("coat", ("horse_body",), True),
    ("mane", ("horse_hair",), True),
    ("silk", ("jockey", "material #4"), True),
    ("tack", ("saddle",), False),
)


def bake_sprites(root, folder="sprites"):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = SPRITE_PX
    scene.render.resolution_y = SPRITE_PX
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True          # ★背景は透過
    scene.render.use_motion_blur = False          # ★スプライトにブラーは焼かない
    scene.eevee.taa_render_samples = 48
    scene.view_settings.view_transform = "Standard"  # ★焼くときは素直な色で

    # ★正射影の真横カメラ（★遠近の歪みを全コマで揃える）
    bpy.ops.object.camera_add(location=(20, 0, 0))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = SPRITE_SPAN_M
    cam.rotation_euler = (math.radians(90), 0, math.radians(90))
    cam.location.z = (FEET_RATIO - 0.5) * SPRITE_SPAN_M
    cam.location.y = 0.0
    scene.camera = cam
    log("接地点を上から %.3f に置きました（カメラ高さ %.3f m）" % (FEET_RATIO, cam.location.z))

    # ⚠️ ★走路・柵・スタンドは焼き込みません（★1 度目は柵が縦線で写り込みました）
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.lower().startswith(("turf", "cube", "plane")):
            o.hide_render = True

    out = os.path.join(OUT, folder)
    os.makedirs(out, exist_ok=True)
    a, b = STRIDE_FRAMES
    span = b - a
    root.location = (0, 0, 0)

    import time
    t0 = time.time()
    for i in range(SPRITE_FRAMES):
        f = a + span * i / SPRITE_FRAMES
        scene.frame_set(int(f), subframe=f - int(f))
        for name, mats, achromatic in LAYERS:
            for other, om, _ in LAYERS:
                set_material_alpha(om, other == name)
            set_saturation(mats, 0.0 if achromatic else 1.0)
            scene.render.filepath = os.path.join(out, "%02d_%s" % (i + 1, name))
            bpy.ops.render.render(write_still=True)
    log("%d コマ × %d 層 を %.1f 秒で焼きました → %s"
        % (SPRITE_FRAMES, len(LAYERS), time.time() - t0, out))
    return out


if __name__ == "__main__":
    main()
