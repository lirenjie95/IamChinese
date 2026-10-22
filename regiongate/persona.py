"""生成一套「像中国人」的身份与机器画像（全部为合成数据）。

这个模块解决的是上一版仓库的反面：上一版把一台美国家宽机器（Comcast、
America/Los_Angeles、en-US）当作「正常人」，把中文环境当作「异常」。这里的
默认值反过来 —— 家宽在杭州、手机号是 139 号段、身份证是浙江的区划码、
系统语言是 ``zh_CN.UTF-8``、时区是 ``Asia/Shanghai``。

四件事必须自洽，否则一眼假：

1. 姓名 / 性别 / 身份证第 17 位的奇偶
2. 身份证前 6 位区划码 / 收货地址所在的省市区
3. 手机号号段 / 运营商 / ASN 归属
4. 系统 locale / 时区 / 日期与货币格式

所有号码都是按 GB 11643-1999 的规则**算出来**的合成串，校验位正确，
但不指向任何真人 —— 姓名、地址、号码三者是随机拼装的。
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

# --------------------------------------------------------------------------
# 姓氏与名字用字（按 2020 年前后的人口普查量级粗排，不追求精确）
# --------------------------------------------------------------------------

SURNAMES: Tuple[str, ...] = (
    "王", "李", "张", "刘", "陈", "杨", "黄", "赵", "吴", "周",
    "徐", "孙", "马", "朱", "胡", "郭", "何", "高", "林", "罗",
    "郑", "梁", "谢", "宋", "唐", "许", "韩", "冯", "邓", "曹",
    "彭", "曾", "肖", "田", "董", "袁", "潘", "于", "蒋", "蔡",
)

# 名字用字按性别粗分。90 年代后出生的人用字和 60 年代差别很大，
# 所以这里只描述「哪一类字常见」，不保证重名率。
GIVEN_CHARS_MALE: Tuple[str, ...] = (
    "伟", "强", "磊", "军", "洋", "勇", "杰", "涛", "明", "超",
    "鹏", "斌", "宇", "浩", "凯", "鑫", "晨", "辉", "博", "楠",
    "哲", "睿", "辰", "昊", "然", "帆", "骁", "骏", "程", "远",
)
GIVEN_CHARS_FEMALE: Tuple[str, ...] = (
    "芳", "娜", "敏", "静", "丽", "艳", "娟", "霞", "婷", "雪",
    "琳", "倩", "颖", "倩", "悦", "欣", "怡", "涵", "萱", "瑶",
    "璐", "薇", "彤", "菲", "萌", "妤", "桐", "舒", "棠", "馨",
)

# 姓的拼音，只为了拼出一个像样的邮箱前缀。缺省回落到 "user"。
SURNAME_PINYIN: Dict[str, str] = {
    "王": "wang", "李": "li", "张": "zhang", "刘": "liu", "陈": "chen",
    "杨": "yang", "黄": "huang", "赵": "zhao", "吴": "wu", "周": "zhou",
    "徐": "xu", "孙": "sun", "马": "ma", "朱": "zhu", "胡": "hu",
    "郭": "guo", "何": "he", "高": "gao", "林": "lin", "罗": "luo",
    "郑": "zheng", "梁": "liang", "谢": "xie", "宋": "song", "唐": "tang",
    "许": "xu", "韩": "han", "冯": "feng", "邓": "deng", "曹": "cao",
    "彭": "peng", "曾": "zeng", "肖": "xiao", "田": "tian", "董": "dong",
    "袁": "yuan", "潘": "pan", "于": "yu", "蒋": "jiang", "蔡": "cai",
}

# --------------------------------------------------------------------------
# 行政区划：省 / 市 / 区 / 身份证前 6 位。真实区划码，真实地名。
# --------------------------------------------------------------------------

_REGIONS: Tuple[Tuple[str, str, str, str], ...] = (
    ("北京市", "北京市", "东城区", "110101"),
    ("北京市", "北京市", "朝阳区", "110105"),
    ("北京市", "北京市", "海淀区", "110108"),
    ("上海市", "上海市", "黄浦区", "310101"),
    ("上海市", "上海市", "徐汇区", "310104"),
    ("上海市", "上海市", "浦东新区", "310115"),
    ("广东省", "广州市", "天河区", "440106"),
    ("广东省", "广州市", "越秀区", "440104"),
    ("广东省", "深圳市", "福田区", "440304"),
    ("广东省", "深圳市", "南山区", "440305"),
    ("浙江省", "杭州市", "西湖区", "330106"),
    ("浙江省", "杭州市", "滨江区", "330108"),
    ("江苏省", "南京市", "玄武区", "320102"),
    ("江苏省", "苏州市", "姑苏区", "320508"),
    ("四川省", "成都市", "武侯区", "510107"),
    ("四川省", "成都市", "锦江区", "510104"),
    ("湖北省", "武汉市", "武昌区", "420106"),
    ("陕西省", "西安市", "雁塔区", "610113"),
    ("山东省", "济南市", "历下区", "370102"),
    ("山东省", "青岛市", "市南区", "370202"),
    ("重庆市", "重庆市", "渝中区", "500103"),
    ("天津市", "天津市", "和平区", "120101"),
    ("辽宁省", "沈阳市", "和平区", "210102"),
    ("福建省", "厦门市", "思明区", "350203"),
    ("湖南省", "长沙市", "岳麓区", "430104"),
    ("安徽省", "合肥市", "蜀山区", "340104"),
    ("河南省", "郑州市", "金水区", "410105"),
    ("云南省", "昆明市", "五华区", "530102"),
)

ROADS: Tuple[str, ...] = (
    "中山路", "人民路", "解放路", "建设路", "长江路", "黄河路",
    "文化路", "学府路", "科技路", "花园路", "青年路", "世纪大道",
    "高新大道", "滨江大道", "迎宾大道", "望江路", "文三路", "学院路",
)

# --------------------------------------------------------------------------
# 手机号段（工信部公开分配的号段）与运营商、ASN 的对应关系
# --------------------------------------------------------------------------

CARRIERS: Tuple[Dict[str, object], ...] = (
    {
        "name": "中国移动",
        "asn": "AS9808",
        "org": "China Mobile Communications Group",
        "prefixes": (
            "134", "135", "136", "137", "138", "139", "147", "150",
            "151", "152", "157", "158", "159", "172", "178", "182",
            "183", "184", "187", "188", "195", "197", "198",
        ),
    },
    {
        "name": "中国联通",
        "asn": "AS4837",
        "org": "China Unicom",
        "prefixes": (
            "130", "131", "132", "145", "155", "156", "166", "167",
            "171", "175", "176", "185", "186", "196",
        ),
    },
    {
        "name": "中国电信",
        "asn": "AS4134",
        "org": "Chinanet",
        "prefixes": (
            "133", "149", "153", "173", "177", "180", "181", "189",
            "190", "191", "199",
        ),
    },
)

EMAIL_DOMAINS: Tuple[str, ...] = (
    "qq.com", "163.com", "126.com", "sina.com", "foxmail.com",
    "aliyun.com", "outlook.com", "139.com",
)

# 单位名用 {city} / {district} 占位，生成时替换成真实地名 —— 广州的人不该
# 在「上海某某公司」上班，这种错位是最容易被一眼看穿的那一类。
OCCUPATIONS: Tuple[Tuple[str, str], ...] = (
    ("后端开发", "{city}某某网络科技有限公司"),
    ("前端开发", "{city}某某信息技术有限公司"),
    ("产品经理", "{city}某某科技有限公司"),
    ("中学教师", "{city}第二中学"),
    ("医院护士", "{city}第一人民医院"),
    ("会计", "{city}某某会计师事务所"),
    ("公务员", "{district}政务服务中心"),
    ("自由职业", "无固定单位"),
    ("外贸业务员", "{city}某某进出口贸易有限公司"),
    ("机械工程师", "{city}某某精密制造股份有限公司"),
)

# --------------------------------------------------------------------------
# 身份证：GB 11643-1999，ISO 7064:1983 MOD 11-2
# --------------------------------------------------------------------------

_ID_WEIGHTS: Tuple[int, ...] = (7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2)
_ID_CHECK_CHARS = "10X98765432"


def id_check_digit(body17: str) -> str:
    """给前 17 位算校验位。非数字直接抛错，避免生成看不出问题的假号。"""
    if len(body17) != 17 or not body17.isdigit():
        raise ValueError("id body must be 17 digits")
    total = sum(int(ch) * w for ch, w in zip(body17, _ID_WEIGHTS))
    return _ID_CHECK_CHARS[total % 11]


def make_id_card(
    region_code: str,
    birth_date: date,
    male: bool,
    sequence: int = 0,
) -> str:
    """拼一个结构合法的 18 位身份证号。

    前 6 位区划、7–14 位出生日期、15–17 位顺序码（第 17 位奇偶表性别）、
    第 18 位校验位。``sequence`` 只影响顺序码，方便测试复现。
    """
    if len(region_code) != 6 or not region_code.isdigit():
        raise ValueError("region_code must be 6 digits")
    seq = (abs(sequence) % 100) * 2 + (1 if male else 0) + 10
    body = (
        region_code
        + birth_date.strftime("%Y%m%d")
        + f"{seq:03d}"
    )
    return body + id_check_digit(body)


def id_card_region(id_number: str) -> Optional[str]:
    """取回身份证前 6 位；长度不对就返回 None。"""
    if not id_number or len(id_number) != 18:
        return None
    head = id_number[:6]
    return head if head.isdigit() else None


# --------------------------------------------------------------------------
# 人设
# --------------------------------------------------------------------------

LOCALE_BCP47 = "zh-Hans-CN"
LOCALE_POSIX = "zh_CN.UTF-8"
LOCALE_WINDOWS = "Chinese (Simplified)_China.936"
TIMEZONE = "Asia/Shanghai"
UTC_OFFSET_MINUTES = 480


@dataclass(frozen=True)
class Persona:
    """一台「中国用户」机器的全部可展示字段。"""

    name: str
    gender: str                      # "男" | "女"
    birth_date: date
    phone: str
    id_card: str
    province: str
    city: str
    district: str
    region_code: str
    address: str
    email: str
    occupation: str
    employer: str
    carrier: str
    asn: str
    org: str
    egress_ip: str
    locale_bcp47: str = LOCALE_BCP47
    locale_posix: str = LOCALE_POSIX
    locale_windows: str = LOCALE_WINDOWS
    timezone: str = TIMEZONE
    utc_offset_minutes: int = UTC_OFFSET_MINUTES
    conventions: Dict[str, str] = field(default_factory=dict)

    # -- 序列化 --------------------------------------------------------

    def as_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "gender": self.gender,
            "birth_date": self.birth_date.isoformat(),
            "phone": self.phone,
            "id_card": self.id_card,
            "address": {
                "province": self.province,
                "city": self.city,
                "district": self.district,
                "region_code": self.region_code,
                "detail": self.address,
            },
            "email": self.email,
            "occupation": self.occupation,
            "employer": self.employer,
            "network": {
                "carrier": self.carrier,
                "asn": self.asn,
                "org": self.org,
                "egress_ip": self.egress_ip,
            },
            "system": {
                "locale_bcp47": self.locale_bcp47,
                "locale_posix": self.locale_posix,
                "locale_windows": self.locale_windows,
                "timezone": self.timezone,
                "utc_offset_minutes": self.utc_offset_minutes,
            },
            "conventions": dict(self.conventions),
        }

    # -- 反序列化 ------------------------------------------------------

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "Persona":
        """从 ``iamchinese-profile.json`` 读回。缺字段直接抛 ``KeyError``，不猜。"""
        address = data["address"]
        network = data["network"]
        system = data["system"]
        for label, block in (("address", address), ("network", network), ("system", system)):
            if not isinstance(block, dict):
                raise ValueError(f"{label} must be an object")
        conventions = data.get("conventions") or {}
        if not isinstance(conventions, dict):
            raise ValueError("conventions must be an object")
        birth_raw = data["birth_date"]
        return cls(
            name=str(data["name"]),
            gender=str(data["gender"]),
            birth_date=date.fromisoformat(str(birth_raw)),
            phone=str(data["phone"]),
            id_card=str(data["id_card"]),
            province=str(address["province"]),
            city=str(address["city"]),
            district=str(address["district"]),
            region_code=str(address["region_code"]),
            address=str(address["detail"]),
            email=str(data["email"]),
            occupation=str(data["occupation"]),
            employer=str(data["employer"]),
            carrier=str(network["carrier"]),
            asn=str(network["asn"]),
            org=str(network["org"]),
            egress_ip=str(network["egress_ip"]),
            locale_bcp47=str(system.get("locale_bcp47", LOCALE_BCP47)),
            locale_posix=str(system.get("locale_posix", LOCALE_POSIX)),
            locale_windows=str(system.get("locale_windows", LOCALE_WINDOWS)),
            timezone=str(system.get("timezone", TIMEZONE)),
            utc_offset_minutes=int(system.get("utc_offset_minutes", UTC_OFFSET_MINUTES)),
            conventions={str(k): str(v) for k, v in dict(conventions).items()},
        )

    # -- 落地成系统设置 -------------------------------------------------

    def env(self) -> Dict[str, str]:
        """POSIX / Git Bash / WSL 下要 export 的那几行。"""
        return {
            "LANG": self.locale_posix,
            "LC_ALL": self.locale_posix,
            "LC_CTYPE": self.locale_posix,
            "TZ": self.timezone,
        }

    def powershell(self) -> str:
        """Windows 下设置区域与时区的等价命令（需要管理员权限的只有 tzutil）。"""
        return "\n".join(
            (
                f'Set-Culture -CultureInfo "{self.locale_bcp47}"',
                f'Set-WinUILanguageOverride -Language "{self.locale_bcp47}"',
                f'tzutil /s "{self.timezone}"',
                f'$env:LANG = "{self.locale_posix}"',
                f'$env:TZ = "{self.timezone}"',
            )
        )

    def env_file(self) -> str:
        return "\n".join(f"{key}={value}" for key, value in self.env().items()) + "\n"

    # -- 自洽性 --------------------------------------------------------

    def consistency(self) -> List[Tuple[str, bool, str]]:
        """四组必须自洽的东西，逐条给结论。返回 (检查项, 是否通过, 说明)。"""
        checks: List[Tuple[str, bool, str]] = []

        checks.append(
            (
                "locale ↔ 时区",
                self.locale_bcp47.endswith("-CN") and self.timezone == TIMEZONE,
                f"{self.locale_bcp47} / {self.timezone}",
            )
        )

        checks.append(
            (
                "身份证区划 ↔ 收货地址",
                id_card_region(self.id_card) == self.region_code,
                f"{id_card_region(self.id_card)} vs {self.region_code}",
            )
        )

        checks.append(
            (
                "身份证顺序码 ↔ 性别",
                int(self.id_card[16]) % 2 == (1 if self.gender == "男" else 0),
                f"第 17 位 {self.id_card[16]} / {self.gender}",
            )
        )

        carrier_prefix = self.phone[:3]
        carrier_ok = any(
            carrier_prefix in carrier["prefixes"]  # type: ignore[operator]
            for carrier in CARRIERS
            if carrier["name"] == self.carrier
        )
        checks.append(
            (
                "手机号段 ↔ 运营商",
                carrier_ok,
                f"{carrier_prefix} / {self.carrier}",
            )
        )

        checks.append(
            (
                "手机号号段 ↔ ASN 归属",
                self.asn in {carrier["asn"] for carrier in CARRIERS},
                f"{self.asn} / {self.org}",
            )
        )

        checks.append(
            (
                "手机号长度",
                len(self.phone) == 11 and self.phone.isdigit(),
                f"{len(self.phone)} 位",
            )
        )

        return checks

    def is_consistent(self) -> bool:
        return all(passed for _, passed, _ in self.consistency())

    # -- 展示 ----------------------------------------------------------

    def card(self) -> str:
        """一行式摘要，给 CLI 的 ``persona`` 子命令用。"""
        lines = [
            f"姓名      {self.name}（{self.gender}，{self.birth_date.isoformat()}）",
            f"手机      {self.phone}（{self.carrier}）",
            f"身份证    {self.id_card}",
            f"地址      {self.province}{self.city}{self.district}{self.address}",
            f"邮箱      {self.email}",
            f"职业      {self.occupation} @ {self.employer}",
            f"网络      {self.asn} {self.org} / {self.egress_ip}",
            f"系统      {self.locale_bcp47} · {self.timezone} (UTC+8)",
            f"约定      日期 {self.conventions.get('date', '-')}，"
            f"货币 {self.conventions.get('currency', '-')}，"
            f"周一为 {self.conventions.get('week_start', '-')}",
        ]
        return "\n".join(lines)


_DEFAULT_CONVENTIONS = {
    "date": "YYYY-MM-DD",
    "datetime": "YYYY-MM-DD HH:mm:ss",
    "currency": "¥ CNY",
    "number": "1,234.56",
    "week_start": "周一",
    "name_order": "姓在前",
    "address_order": "省 → 市 → 区 → 街道",
    "unit": "公制",
}


def _make_phone(rng: random.Random, carrier: Dict[str, object]) -> str:
    prefixes: Sequence[str] = carrier["prefixes"]  # type: ignore[assignment]
    prefix = prefixes[rng.randrange(len(prefixes))]
    return prefix + "".join(str(rng.randrange(10)) for _ in range(8))


def build_persona(seed: Optional[int] = None) -> Persona:
    """生成一个人设。给定 ``seed`` 则完全可复现。"""
    rng = random.Random(seed)

    surname = SURNAMES[rng.randrange(len(SURNAMES))]
    male = rng.random() < 0.52
    pool = GIVEN_CHARS_MALE if male else GIVEN_CHARS_FEMALE
    given = pool[rng.randrange(len(pool))]
    if rng.random() < 0.55:
        given += pool[rng.randrange(len(pool))]
    name = surname + given

    province, city, district, region_code = _REGIONS[rng.randrange(len(_REGIONS))]

    birth = date(1975, 1, 1) + timedelta(days=rng.randrange(365 * 31))
    id_card = make_id_card(region_code, birth, male, sequence=rng.randrange(1000))

    carrier = CARRIERS[rng.randrange(len(CARRIERS))]
    phone = _make_phone(rng, carrier)

    road = ROADS[rng.randrange(len(ROADS))]
    address = f"{road}{rng.randrange(1, 999)}号{rng.randrange(1, 30)}栋{rng.randrange(1, 28)}0{rng.randrange(1, 10)}室"

    local = SURNAME_PINYIN.get(surname, "user")
    email = f"{local}{rng.randrange(1970, 2010)}{rng.randrange(100, 999)}@{EMAIL_DOMAINS[rng.randrange(len(EMAIL_DOMAINS))]}"

    occupation, employer_template = OCCUPATIONS[rng.randrange(len(OCCUPATIONS))]
    employer = employer_template.format(city=city, district=district)

    # 家宽出口：运营商私网地址段之外的可展示样例地址，故意用一个不会与真人冲突的
    # 文档用段（TEST-NET-3）打头，避免有人把它当成真实地址去扫。
    egress_ip = f"203.0.113.{rng.randrange(2, 250)}"

    return Persona(
        name=name,
        gender="男" if male else "女",
        birth_date=birth,
        phone=phone,
        id_card=id_card,
        province=province,
        city=city,
        district=district,
        region_code=region_code,
        address=address,
        email=email,
        occupation=occupation,
        employer=employer,
        carrier=str(carrier["name"]),
        asn=str(carrier["asn"]),
        org=str(carrier["org"]),
        egress_ip=egress_ip,
        conventions=dict(_DEFAULT_CONVENTIONS),
    )


DEFAULT_PERSONA_SEED = 20261019

__all__ = [
    "CARRIERS",
    "DEFAULT_PERSONA_SEED",
    "EMAIL_DOMAINS",
    "GIVEN_CHARS_FEMALE",
    "GIVEN_CHARS_MALE",
    "LOCALE_BCP47",
    "LOCALE_POSIX",
    "LOCALE_WINDOWS",
    "OCCUPATIONS",
    "Persona",
    "ROADS",
    "SURNAMES",
    "TIMEZONE",
    "UTC_OFFSET_MINUTES",
    "build_persona",
    "id_card_region",
    "id_check_digit",
    "make_id_card",
]
