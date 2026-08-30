from pydantic import BaseModel


class MapPoint(BaseModel):
    id: str
    municipality: str
    latitude: float
    longitude: float
    crop: str
    available_kg: int
    demo: bool = True
