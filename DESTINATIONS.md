# REDOWN destination model

A destination profile is independent. It may point to Cloudflare R2 or GitHub.

## Common settings

- display/menu label
- right-click visibility
- menu order
- default category
- menu tree
- one-click or nested behavior

## Recursive menu tree

`menuTree` is recursive and has no application-defined depth limit.

Example:

```json
[
  {
    "id": "3d",
    "label": "3D",
    "children": [
      {
        "id": "characters",
        "label": "Characters",
        "children": [
          {
            "id": "heroes",
            "label": "Heroes",
            "category": "3d",
            "prefix": "3d/characters/heroes",
            "children": []
          }
        ]
      }
    ]
  }
]
```

Parent nodes only create pop-out menus. Leaf nodes perform the download.

For Cloudflare leaves, `prefix` selects the R2 object-key prefix.
For GitHub leaves, `path` selects the repository directory.

An empty `menuTree` means the profile is a one-click preset and REDOWN uses its saved default category/path.
