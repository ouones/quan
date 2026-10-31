# AGENTS.md

## 适用范围

本仓库维护 Clash/Mihomo、Egern、Loon、Surge 分流规则，以及少量模块和脚本配置。

## 规则文件格式

- 根目录多数 `.yaml` 文件面向 Clash / Mihomo / OpenClash，使用 `payload:`：

  ```yaml
  payload:
    - DOMAIN-SUFFIX,example.com
  ```

- `egern/` 下的对应文件面向 Egern；按规则类型拆分为集合，不使用 `payload:`：

  ```yaml
  domain_suffix_set:
  - example.com
  ```

- `loon/` 下的 `.list` 文件是 Loon 订阅规则，每行一条规则，不使用 `payload:`，策略由订阅时指定：

  ```text
  DOMAIN-SUFFIX,example.com
  ```

  官方文档：[域名规则](https://nsloon.app/docs/Rule/domain_rule)、[IP 规则](https://nsloon.app/docs/Rule/ip_rule)、[端口规则](https://nsloon.app/docs/Rule/port_rule)、[订阅规则](https://nsloon.app/docs/Rule/sub_rule)。

- `surge/` 下的 `.list` 文件是 Surge 外部规则集，每行一条子规则，不写策略名；策略由引用该规则集的 `RULE-SET` 指定。

## 维护规则

1. 任何客户端的分流规则发生新增、修改或删除时，必须在同一次变更中实时同步根目录 Clash/Mihomo、`egern/`、`loon/`、`surge/` 的同名规则集，不得只更新单端。保留各客户端支持的格式、匹配语义和 IP 解析行为；无法等价表达的差异必须明确记录并告知，不得声称完全一致。
2. 同步到 Egern 时，按以下映射转换规则类型：
   - `DOMAIN-SUFFIX` → `domain_suffix_set`
   - `DOMAIN` → `domain_set`
   - `DOMAIN-KEYWORD` → `domain_keyword_set`
   - `IP-CIDR` → `ip_cidr_set`
   - `DST-PORT` → `dest_port_set`
3. 域名规则优先使用 `DOMAIN-SUFFIX`；Egern 对应使用 `domain_suffix_set`。
4. 从 URL 提取规则时，只保留域名，移除协议、端口和路径。
5. 提交前逐一核对四端同名规则集的规则类型、内容和可表达的匹配语义（包括 IP 的 DNS 解析行为），确认无遗漏、额外规则或重复规则；规则顺序及客户端差异也要检查。
6. `surge/` 下所有 `.list` 文件中的 `IP-CIDR` 和 `IP-CIDR6` 规则必须添加 `no-resolve`。
7. 以 Loon 现有规则为本次同步基准；后续从任一客户端更新时均须四端同步。`DOMAIN`、`DOMAIN-SUFFIX`、`DOMAIN-KEYWORD`、`IP-CIDR` 按客户端格式转换，Clash 的 `DST-PORT` 对应 Loon/Surge 的 `DEST-PORT`；Loon 端口规则需要 3.1.7 或以上版本。IP 规则的 `no-resolve` 应同步到支持的客户端；Egern 规则集使用 `no_resolve: true`，它作用于规则集内所有 IP 规则，如单个规则集需要混用解析行为，应先确认可行的等价方案，不得静默合并。
