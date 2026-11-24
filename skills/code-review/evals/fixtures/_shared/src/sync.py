def is_expired(item, today):
    return item.due < today
