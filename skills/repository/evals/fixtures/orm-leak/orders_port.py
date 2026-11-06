from sqlalchemy import Select


class Orders:
    def list(self, query: Select) -> list[str]:
        raise NotImplementedError
