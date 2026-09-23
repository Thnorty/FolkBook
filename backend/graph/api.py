from uuid import UUID

from django.shortcuts import get_object_or_404
from ninja import Field, Query, Router, Schema

from access.policy import visible_people
from core.api import access_for
from graph.queries import Edge, Graph, Path, neighborhood, paths_to, visible_graph
from graph.schemas import GraphOut, PathsOut

router = Router(tags=["graph"])


class NeighborhoodParams(Schema):
    hops: int = Field(1, ge=1, le=2)


class PathParams(Schema):
    alternatives: int = Field(2, ge=0, le=5)


def _edge_details(edge: Edge) -> dict:
    link = edge.relationship
    return {
        "kind": edge.kind,
        "type": link.type if link else None,
        "label": link.label if link else "",
        "space": edge.space,
    }


def _graph_out(graph: Graph, me_id: UUID) -> dict:
    return {
        "nodes": [
            {
                "id": person.pk,
                "name": person.name,
                "is_me": person.pk == me_id,
                "spaces": graph.spaces_of.get(person.pk, []),
            }
            for person in graph.people.values()
        ],
        "edges": [
            {"id": e.id, "source": e.a, "target": e.b, "former": e.is_former, **_edge_details(e)}
            for e in graph.edges
        ],
    }


def _paths_out(paths: list[Path], people: dict) -> dict:
    return {
        "paths": [
            {
                "hops": [
                    {
                        "source": people[hop.source],
                        "target": people[hop.target],
                        **_edge_details(hop.edge),
                    }
                    for hop in path
                ]
            }
            for path in paths
        ]
    }


@router.get("", response=GraphOut)
def get_graph(request):
    """Everyone the user can see and how they're connected."""
    access = access_for(request)
    return _graph_out(visible_graph(access), access.user.me.pk)


@router.get("/neighborhood/{person_id}", response=GraphOut)
def get_neighborhood(request, person_id: UUID, params: Query[NeighborhoodParams]):
    """Focus mode: a person and everyone within 1 or 2 steps."""
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=person_id)
    return _graph_out(neighborhood(access, person, params.hops), access.user.me.pk)


@router.get("/paths/{person_id}", response=PathsOut)
def get_paths(request, person_id: UUID, params: Query[PathParams]):
    """How do I know …? Routes from the user's Me to this person."""
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=person_id)
    graph = visible_graph(access)
    return _paths_out(paths_to(access, person, params.alternatives, graph), graph.people)
