from fastapi import APIRouter

from app.schemas.demo import MapPoint

router = APIRouter()

DEMO_MAP_POINTS = [
    MapPoint(
        id="demo-1",
        municipality="Buga",
        latitude=3.9008,
        longitude=-76.3096,
        crop="Caña de azúcar",
        available_kg=5000,
    ),
    MapPoint(
        id="demo-2",
        municipality="Palmira",
        latitude=3.5406,
        longitude=-76.3050,
        crop="Maíz",
        available_kg=3500,
    ),
    MapPoint(
        id="demo-3",
        municipality="Tuluá",
        latitude=4.0886,
        longitude=-75.7627,
        crop="Plátano",
        available_kg=2200,
    ),
    MapPoint(
        id="demo-4",
        municipality="Cali",
        latitude=3.4372,
        longitude=-76.5069,
        crop="Yuca",
        available_kg=4100,
    ),
]


@router.get("/map-points", response_model=list[MapPoint])
async def get_map_points():
    """
    Retorna puntos demostrativos geoespaciales del Valle del Cauca.
    Todos los registros tienen demo=true y son únicamente para demostración.
    """
    return DEMO_MAP_POINTS
