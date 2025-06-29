export interface TreeNode {
  id: string;
  title: string;
  subtitle: string;
  ip: string;
  url: string;
  children?: TreeNode[];
}

export interface TreeConfig {
  nodes: TreeNode[];
}

// Single root tree configuration
export const defaultTreeConfig: TreeConfig = {
  nodes: [
    {
      id: "root-1",
      title: "Proxmox",
      subtitle: "Primary application server",
      ip: "proxmox.lan:8006",
      url: "proxmox.koenvogel.com",
      children: [
        {
          id: "child-1-1",
          title: "Radarr",
          subtitle: "User interface application",
          ip: "pirate.lan:7878",
          url: "radarr.koenvogel.com",
          children: [
            {
              id: "grandchild-1-1-1",
              title: "Sonarr",
              subtitle: "Authentication module",
              ip: "pirate.lan:8989",
              url: "sonarr.koenvogel.com",
            },
          ]
        },
      ]
    }
  ]
};