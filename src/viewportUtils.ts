import OBR from "@owlbear-rodeo/sdk";

export async function focusViewportOnItems(itemIds: string[]) {
  const bounds = await OBR.scene.items.getItemBounds(itemIds);
  const boundsScreenCenter = await OBR.viewport.transformPoint(bounds.center);
  const [viewportWidth, viewportHeight] = await Promise.all([
    OBR.viewport.getWidth(),
    OBR.viewport.getHeight(),
  ]);
  const viewportCenter = {
    x: viewportWidth / 2,
    y: viewportHeight / 2,
  };
  const screenOffset = {
    x: boundsScreenCenter.x - viewportCenter.x,
    y: boundsScreenCenter.y - viewportCenter.y,
  };
  const worldOffset = await OBR.viewport.inverseTransformPoint(screenOffset);
  const scale = await OBR.viewport.getScale();

  await OBR.viewport.animateTo({
    scale,
    position: {
      x: worldOffset.x * -scale,
      y: worldOffset.y * -scale,
    },
  });
}
