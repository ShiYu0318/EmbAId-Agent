from httpx import AsyncClient


async def _second_client(app_client: AsyncClient) -> dict[str, str]:
    response = await app_client.post(
        "/auth/signup",
        json={"email": "intruder@example.com", "password": "an0ther-secret-pass"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_create_project_without_template_uses_defaults(authed_client: AsyncClient) -> None:
    response = await authed_client.post("/v1/projects", json={"name": "支援中心"})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "支援中心"
    assert body["template"] is None
    assert body["system_prompt"] is None
    assert body["widget_config"] == {}
    assert body["default_locale"] == "zh-TW"
    assert body["chat_provider"] == "anthropic"
    assert body["embedding_provider"] == "openai"


async def test_create_project_with_template_seeds_persona(authed_client: AsyncClient) -> None:
    response = await authed_client.post(
        "/v1/projects", json={"name": "客服機器人", "template": "customer_support"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["template"] == "customer_support"
    assert body["system_prompt"]
    widget = body["widget_config"]
    assert widget["greeting"]
    assert widget["bot_name"]
    assert widget["persona"]
    assert 3 <= len(widget["suggested_questions"]) <= 4


async def test_create_project_rejects_unknown_template(authed_client: AsyncClient) -> None:
    response = await authed_client.post(
        "/v1/projects", json={"name": "x", "template": "does_not_exist"}
    )

    assert response.status_code == 400
    assert "unknown template" in response.json()["detail"]["message"]


async def test_create_project_rejects_unknown_chat_provider(authed_client: AsyncClient) -> None:
    response = await authed_client.post(
        "/v1/projects", json={"name": "x", "chat_provider": "mystery-ai"}
    )

    assert response.status_code == 400
    assert "chat_provider" in response.json()["detail"]["message"]


async def test_create_project_rejects_anthropic_embeddings(authed_client: AsyncClient) -> None:
    response = await authed_client.post(
        "/v1/projects", json={"name": "x", "embedding_provider": "anthropic"}
    )

    assert response.status_code == 400
    assert "embedding" in response.json()["detail"]["message"]


async def test_update_project_rejects_anthropic_embeddings(authed_client: AsyncClient) -> None:
    created = await authed_client.post("/v1/projects", json={"name": "x"})
    project_id = created.json()["id"]

    response = await authed_client.patch(
        f"/v1/projects/{project_id}", json={"embedding_provider": "anthropic"}
    )

    assert response.status_code == 400


async def test_list_projects_is_scoped_to_owner(authed_client: AsyncClient) -> None:
    await authed_client.post("/v1/projects", json={"name": "mine"})
    headers = await _second_client(authed_client)

    response = await authed_client.get("/v1/projects")
    assert response.status_code == 200
    assert [project["name"] for project in response.json()] == ["mine"]

    other = await authed_client.get("/v1/projects", headers=headers)
    assert other.status_code == 200
    assert other.json() == []


async def test_other_owner_gets_404_not_403(authed_client: AsyncClient) -> None:
    created = await authed_client.post("/v1/projects", json={"name": "private"})
    project_id = created.json()["id"]
    headers = await _second_client(authed_client)

    assert (await authed_client.get(f"/v1/projects/{project_id}", headers=headers)).status_code == (
        404
    )
    assert (
        await authed_client.patch(
            f"/v1/projects/{project_id}", json={"name": "stolen"}, headers=headers
        )
    ).status_code == 404
    assert (
        await authed_client.delete(f"/v1/projects/{project_id}", headers=headers)
    ).status_code == 404
    assert (
        await authed_client.get(f"/v1/projects/{project_id}/widget-config", headers=headers)
    ).status_code == 404


async def test_update_and_delete_project(authed_client: AsyncClient) -> None:
    created = await authed_client.post("/v1/projects", json={"name": "before"})
    project_id = created.json()["id"]

    updated = await authed_client.patch(
        f"/v1/projects/{project_id}",
        json={
            "name": "after",
            "chat_provider": "ollama",
            "chat_model": "llama3.1",
            "confidence_threshold": 0.6,
            "staleness_days": 30,
            "system_prompt": "只用繁體中文回答。",
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "after"
    assert body["chat_provider"] == "ollama"
    assert body["confidence_threshold"] == 0.6
    assert body["staleness_days"] == 30

    assert (await authed_client.delete(f"/v1/projects/{project_id}")).status_code == 204
    assert (await authed_client.get(f"/v1/projects/{project_id}")).status_code == 404


async def test_widget_config_roundtrip(authed_client: AsyncClient) -> None:
    created = await authed_client.post(
        "/v1/projects", json={"name": "widget", "template": "sales_assistant"}
    )
    project_id = created.json()["id"]

    seeded = await authed_client.get(f"/v1/projects/{project_id}/widget-config")
    assert seeded.status_code == 200
    assert seeded.json()["greeting"]

    payload = {
        "greeting": "歡迎光臨，需要什麼協助嗎？",
        "suggested_questions": ["方案怎麼選？", "可以試用嗎？"],
        "bot_name": "小助手",
        "bot_avatar_url": "https://example.com/avatar.png",
        "persona": "親切的產品顧問",
        "accent_color": "#ff0055",
    }
    put = await authed_client.put(f"/v1/projects/{project_id}/widget-config", json=payload)
    assert put.status_code == 200
    assert put.json() == payload

    fetched = await authed_client.get(f"/v1/projects/{project_id}/widget-config")
    assert fetched.json() == payload


async def test_list_project_templates(authed_client: AsyncClient) -> None:
    response = await authed_client.get("/v1/project-templates")

    assert response.status_code == 200
    templates = response.json()
    keys = {template["key"] for template in templates}
    assert {
        "customer_support",
        "sales_assistant",
        "documentation_helper",
        "internal_knowledge_base",
    } <= keys
    for template in templates:
        assert template["greeting"]
        assert template["system_prompt"]
        assert 3 <= len(template["suggested_questions"]) <= 4


async def test_project_endpoints_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/v1/projects")).status_code == 401
    assert (await client.post("/v1/projects", json={"name": "x"})).status_code == 401
    assert (await client.get("/v1/project-templates")).status_code == 401


async def test_create_tag_and_reject_duplicate(authed_client: AsyncClient) -> None:
    created = await authed_client.post("/v1/projects", json={"name": "tags"})
    project_id = created.json()["id"]

    first = await authed_client.post(f"/v1/projects/{project_id}/tags", json={"name": "產品"})
    assert first.status_code == 201

    duplicate = await authed_client.post(f"/v1/projects/{project_id}/tags", json={"name": "產品"})
    assert duplicate.status_code == 409

    listed = await authed_client.get(f"/v1/projects/{project_id}/tags")
    assert [tag["name"] for tag in listed.json()] == ["產品"]


async def test_same_tag_name_allowed_in_different_projects(authed_client: AsyncClient) -> None:
    first_id = (await authed_client.post("/v1/projects", json={"name": "a"})).json()["id"]
    second_id = (await authed_client.post("/v1/projects", json={"name": "b"})).json()["id"]

    assert (
        await authed_client.post(f"/v1/projects/{first_id}/tags", json={"name": "共用"})
    ).status_code == 201
    assert (
        await authed_client.post(f"/v1/projects/{second_id}/tags", json={"name": "共用"})
    ).status_code == 201


async def test_update_and_delete_tag(authed_client: AsyncClient) -> None:
    project_id = (await authed_client.post("/v1/projects", json={"name": "tags"})).json()["id"]
    tag_id = (
        await authed_client.post(f"/v1/projects/{project_id}/tags", json={"name": "舊名稱"})
    ).json()["id"]

    updated = await authed_client.patch(f"/v1/tags/{tag_id}", json={"name": "新名稱"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "新名稱"

    assert (await authed_client.delete(f"/v1/tags/{tag_id}")).status_code == 204
    assert (await authed_client.get(f"/v1/projects/{project_id}/tags")).json() == []


async def test_tag_rename_conflict_returns_409(authed_client: AsyncClient) -> None:
    project_id = (await authed_client.post("/v1/projects", json={"name": "tags"})).json()["id"]
    await authed_client.post(f"/v1/projects/{project_id}/tags", json={"name": "既有"})
    tag_id = (
        await authed_client.post(f"/v1/projects/{project_id}/tags", json={"name": "另一個"})
    ).json()["id"]

    response = await authed_client.patch(f"/v1/tags/{tag_id}", json={"name": "既有"})
    assert response.status_code == 409


async def test_tags_are_scoped_to_owner(authed_client: AsyncClient) -> None:
    project_id = (await authed_client.post("/v1/projects", json={"name": "tags"})).json()["id"]
    tag_id = (
        await authed_client.post(f"/v1/projects/{project_id}/tags", json={"name": "私密"})
    ).json()["id"]
    headers = await _second_client(authed_client)

    assert (
        await authed_client.get(f"/v1/projects/{project_id}/tags", headers=headers)
    ).status_code == 404
    assert (
        await authed_client.patch(f"/v1/tags/{tag_id}", json={"name": "x"}, headers=headers)
    ).status_code == 404
    assert (await authed_client.delete(f"/v1/tags/{tag_id}", headers=headers)).status_code == 404


async def test_update_project_rejects_null_for_required_fields(
    authed_client: AsyncClient,
) -> None:
    project = (await authed_client.post("/v1/projects", json={"name": "Docs"})).json()
    url = f"/v1/projects/{project['id']}"

    rejected = await authed_client.patch(url, json={"name": None, "staleness_days": None})
    assert rejected.status_code == 422

    await authed_client.patch(url, json={"system_prompt": "Be brief."})
    cleared = await authed_client.patch(url, json={"system_prompt": None})
    assert cleared.status_code == 200
    assert cleared.json()["system_prompt"] is None
    assert cleared.json()["name"] == "Docs"
